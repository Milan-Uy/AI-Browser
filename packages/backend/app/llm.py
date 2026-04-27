import json
import logging
import os
from typing import AsyncIterator, List, Optional, Protocol, runtime_checkable

from .mock_llm import mock_stream
from .schemas import ChatRequest, PageContent, TurnRecord

logger = logging.getLogger(__name__)


def _log_request(backend: str, turn: int, message: str, page: Optional[PageContent], history: List[TurnRecord]) -> None:
    full = os.environ.get("AIB_LOG_LLM_FULL", "").lower() in ("1", "true")
    if full:
        payload = {
            "event": "llm_request",
            "backend": backend,
            "turn": turn,
            "message": message,
            "page": page.model_dump() if page else None,
            "history": [r.model_dump() for r in history],
        }
    else:
        payload = {
            "event": "llm_request",
            "backend": backend,
            "turn": turn,
            "message": message,
            "page": {
                "url": page.url,
                "title": page.title,
                "text_len": len(page.text),
                "elements": len(page.elements),
                "elements_preview": [e.model_dump() for e in page.elements[:5]],
            } if page else None,
            "history_len": len(history),
        }
    logger.info(json.dumps(payload))


def _log_response(backend: str, turn: int, actions: list, completed: bool) -> None:
    logger.info(json.dumps({
        "event": "llm_response",
        "backend": backend,
        "turn": turn,
        "actions": actions,
        "completed": completed,
    }))


@runtime_checkable
class LLMBackend(Protocol):
    async def stream(
        self,
        message: str,
        page: Optional[PageContent],
        history: List[TurnRecord],
    ) -> AsyncIterator[str]: ...


def _build_prompt(message: str, page: Optional[PageContent], history: List[TurnRecord]) -> str:
    prompt_lines: list[str] = [
        "You are an AI browser assistant. The user gives you a task and you "
        "either answer it directly or perform browser actions to accomplish it.",
        "",
        "To perform a browser action, output a line in this exact format (JSON on one line):",
        '  ACTION: {"kind": "click", "selector": "#submit"}',
        '  ACTION: {"kind": "fill", "selector": "#email", "value": "user@example.com"}',
        '  ACTION: {"kind": "navigate", "url": "https://example.com"}',
        '  ACTION: {"kind": "scroll", "direction": "down", "amount": 300}',
        '  ACTION: {"kind": "select", "selector": "#dropdown", "value": "option1"}',
        "",
        "At the very end of your response, output exactly one of these lines:",
        "  DONE: true   (task is complete — no further turns needed)",
        "  DONE: false  (more turns are needed to finish the task)",
        "",
    ]

    if page:
        prompt_lines += [
            "## Current page",
            f"URL: {page.url}",
            f"Title: {page.title}",
        ]
        if page.selection:
            prompt_lines.append(f"Selected text: {page.selection}")
        page_text = page.text[:3000] + ("\n[...truncated...]" if len(page.text) > 3000 else "")
        prompt_lines += [f"Page text:\n{page_text}", ""]
        if page.elements:
            prompt_lines.append("Interactive elements (use these selectors for actions):")
            for el in page.elements:
                parts = [f"selector={el.selector!r}", f"tag={el.tag!r}"]
                if el.type:
                    parts.append(f"type={el.type!r}")
                if el.placeholder:
                    parts.append(f"placeholder={el.placeholder!r}")
                if el.text:
                    parts.append(f"text={el.text!r}")
                prompt_lines.append("  - " + ", ".join(parts))
            prompt_lines.append("")

    if history:
        prompt_lines.append("## Prior turns")
        for i, rec in enumerate(history):
            prompt_lines.append(f"Turn {i}:")
            for act in rec.actions:
                prompt_lines.append(f"  Action taken: {json.dumps(act.model_dump())}")
        prompt_lines.append("")

    prompt_lines += ["## Task", message]
    return "\n".join(prompt_lines)


def _parse_model_line(line: str, actions: list) -> tuple[Optional[str], Optional[bool]]:
    """Parse one line of model output. Returns (chunk_to_yield, completed_value).

    - If the line is `ACTION: {...}`, append to `actions` and return a JSON action chunk.
    - If the line is `DONE: true|false`, return the parsed bool as completed.
    - Otherwise return a JSON text chunk.
    Either return value may be None.
    """
    stripped = line.strip()
    if stripped.startswith("ACTION:"):
        action_json = stripped[len("ACTION:"):].strip()
        try:
            action_obj = json.loads(action_json)
            actions.append(action_obj)
            return json.dumps({"type": "action", "action": action_obj}), None
        except json.JSONDecodeError:
            return json.dumps({"type": "text", "content": line}), None
    if stripped.upper().startswith("DONE:"):
        return None, stripped[5:].strip().lower() == "true"
    if line:
        return json.dumps({"type": "text", "content": line}), None
    return None, None


class MockLLM:
    name = "mock"

    async def stream(
        self,
        message: str,
        page: Optional[PageContent],
        history: List[TurnRecord],
    ) -> AsyncIterator[str]:
        turn = len(history)
        _log_request(self.name, turn, message, page, history)
        actions: list = []
        completed = False

        async def _gen() -> AsyncIterator[str]:
            nonlocal completed
            async for raw in mock_stream(message, page, turn):
                parsed = json.loads(raw)
                if parsed.get("type") == "action":
                    actions.append(parsed["action"])
                elif parsed.get("type") == "done":
                    completed = parsed.get("completed", True)
                yield raw
            _log_response(self.name, turn, actions, completed)

        return _gen()


class GeminiLLM:
    name = "gemini"

    async def stream(
        self,
        message: str,
        page: Optional[PageContent],
        history: List[TurnRecord],
    ) -> AsyncIterator[str]:
        import google.generativeai as genai  # deferred: only needed when backend=gemini

        api_key = os.environ.get("GEMINI_API_KEY", "")
        if not api_key:
            raise ValueError(
                "GEMINI_API_KEY is not set. "
                "Add it to packages/backend/.env or export it in your shell."
            )
        genai.configure(api_key=api_key)

        turn = len(history)
        _log_request(self.name, turn, message, page, history)
        actions: list = []
        completed = False

        prompt = _build_prompt(message, page, history)
        model = genai.GenerativeModel("gemini-2.0-flash")

        async def _gen() -> AsyncIterator[str]:
            nonlocal completed
            response = await model.generate_content_async(prompt, stream=True)
            async for chunk in response:
                chunk_text = chunk.text if chunk.text else ""
                for line in chunk_text.splitlines(keepends=True):
                    out, done_val = _parse_model_line(line, actions)
                    if out is not None:
                        yield out
                    if done_val is not None:
                        completed = done_val
            yield json.dumps({"type": "done", "completed": completed})
            _log_response(self.name, turn, actions, completed)

        return _gen()


class CustomLLM:
    """Backend for a proprietary LLM exposed as a streaming HTTP API.

    Configure with:
      AIB_LLM_BACKEND=custom
      AIB_CUSTOM_API_URL=https://your-llm-host.example.com    (no trailing slash)
      AIB_CUSTOM_API_KEY=your-bearer-token
      AIB_CUSTOM_MODEL=optional-model-name
      AIB_CUSTOM_ENDPOINT_PATH=/openapi/chat/v1/messages       (override if different)

    The default request body and SSE-chunk parser assume an OpenAI-style
    `{choices: [{delta: {content: "..."}}]}` shape. Edit the two blocks marked
    `ADAPT` if your provider uses a different schema.
    """

    name = "custom"

    async def stream(
        self,
        message: str,
        page: Optional[PageContent],
        history: List[TurnRecord],
    ) -> AsyncIterator[str]:
        import httpx  # deferred: only needed when backend=custom

        api_url = os.environ.get("AIB_CUSTOM_API_URL", "").rstrip("/")
        api_key = os.environ.get("AIB_CUSTOM_API_KEY", "")
        model_name = os.environ.get("AIB_CUSTOM_MODEL", "")
        endpoint_path = os.environ.get("AIB_CUSTOM_ENDPOINT_PATH", "/openapi/chat/v1/messages")
        if not api_url or not api_key:
            raise ValueError(
                "AIB_CUSTOM_API_URL and AIB_CUSTOM_API_KEY must be set. "
                "Add them to packages/backend/.env."
            )

        turn = len(history)
        _log_request(self.name, turn, message, page, history)
        actions: list = []
        completed = False

        prompt = _build_prompt(message, page, history)

        # ─── ADAPT: request schema for your proprietary API ───────────────
        endpoint = f"{api_url}{endpoint_path}"
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "Accept": "text/event-stream",
        }
        body: dict = {
            "messages": [{"role": "user", "content": prompt}],
            "stream": True,
        }
        if model_name:
            body["model"] = model_name
        # ──────────────────────────────────────────────────────────────────

        async def _gen() -> AsyncIterator[str]:
            nonlocal completed
            async with httpx.AsyncClient(timeout=120.0) as client:
                async with client.stream("POST", endpoint, headers=headers, json=body) as resp:
                    resp.raise_for_status()
                    async for raw_line in resp.aiter_lines():
                        text_piece = _extract_custom_chunk_text(raw_line)
                        if not text_piece:
                            continue
                        for chunk_line in text_piece.splitlines(keepends=True):
                            out, done_val = _parse_model_line(chunk_line, actions)
                            if out is not None:
                                yield out
                            if done_val is not None:
                                completed = done_val
            yield json.dumps({"type": "done", "completed": completed})
            _log_response(self.name, turn, actions, completed)

        return _gen()


def _extract_custom_chunk_text(raw_line: str) -> str:
    """Extract the text payload from one streamed line of the custom LLM response.

    ─── ADAPT: stream-chunk parser for your proprietary API ──────────────
    Default: OpenAI-style SSE — `data: {"choices":[{"delta":{"content":"..."}}]}`.
    Common alternatives:
      - NDJSON:    each line is a bare JSON object (drop the "data: " check).
      - Anthropic: parse `event: content_block_delta` then `data: {...}` with `.delta.text`.
      - Plain text: return `raw_line + "\\n"` directly.
    ──────────────────────────────────────────────────────────────────────
    """
    if not raw_line or not raw_line.startswith("data:"):
        return ""
    payload = raw_line[5:].strip()
    if payload in ("", "[DONE]"):
        return ""
    try:
        obj = json.loads(payload)
    except json.JSONDecodeError:
        return ""
    choices = obj.get("choices") or []
    if not choices:
        return ""
    delta = choices[0].get("delta") or {}
    return delta.get("content", "") or ""


_BACKENDS: dict[str, type] = {
    "mock": MockLLM,
    "gemini": GeminiLLM,
    "custom": CustomLLM,
}


def get_llm() -> MockLLM | GeminiLLM | CustomLLM:
    name = os.environ.get("AIB_LLM_BACKEND", "mock").lower()
    cls = _BACKENDS.get(name)
    if cls is None:
        raise ValueError(f"Unknown AIB_LLM_BACKEND={name!r}. Choose from: {list(_BACKENDS)}")
    return cls()
