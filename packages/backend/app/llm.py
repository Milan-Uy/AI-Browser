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


def _build_system_prompt(page: Optional[PageContent], history: List[TurnRecord]) -> str:
    prompt_lines: list[str] = [
        "You are an AI browser assistant. The user gives you a task and you "
        "either answer it directly or perform browser actions to accomplish it.",
        "",
        "To perform a browser action, output a line in this exact format (JSON on one line).",
        'Include a short "description" field with a human-readable label for the element (e.g. "sign in button", "email field"):',
        '  ACTION: {"kind": "click", "selector": "#submit", "description": "sign in button"}',
        '  ACTION: {"kind": "fill", "selector": "#email", "value": "user@example.com", "description": "email field"}',
        '  ACTION: {"kind": "navigate", "url": "https://example.com"}',
        '  ACTION: {"kind": "scroll", "direction": "down", "amount": 300}',
        '  ACTION: {"kind": "select", "selector": "#dropdown", "value": "option1", "description": "dropdown"}',
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

    return "\n".join(prompt_lines)


def _build_prompt(message: str, page: Optional[PageContent], history: List[TurnRecord]) -> str:
    return _build_system_prompt(page, history) + "\n## Task\n" + message


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


class GaussLLM:
    """Backend for the Gauss OpenAPI LLM (POST /openapi/chat/v1/messages).

    Required env:
      AIB_LLM_BACKEND=gauss
      AIB_GAUSS_API_URL=https://your-gauss-host.example.com    (no trailing slash)
      AIB_GAUSS_CLIENT=<x-generative-ai-client header value>
      AIB_GAUSS_TOKEN=<x-openapi-token header value>
      AIB_GAUSS_MODEL_IDS=model-id-a,model-id-b                (comma-separated)

    Optional env:
      AIB_GAUSS_USER_EMAIL=<x-generative-ai-user-email header>
      AIB_GAUSS_ENDPOINT_PATH=/openapi/chat/v1/messages         (override if different)
      AIB_GAUSS_STREAM=1                                        (default: 1; set 0 for non-stream)
    """

    name = "gauss"

    async def stream(
        self,
        message: str,
        page: Optional[PageContent],
        history: List[TurnRecord],
    ) -> AsyncIterator[str]:
        import httpx  # deferred: only needed when backend=gauss

        api_url = os.environ.get("AIB_GAUSS_API_URL", "").rstrip("/")
        client_id = os.environ.get("AIB_GAUSS_CLIENT", "")
        token = os.environ.get("AIB_GAUSS_TOKEN", "")
        model_ids_raw = os.environ.get("AIB_GAUSS_MODEL_IDS", "")
        endpoint_path = os.environ.get("AIB_GAUSS_ENDPOINT_PATH", "/openapi/chat/v1/messages")
        user_email = os.environ.get("AIB_GAUSS_USER_EMAIL", "")
        stream_enabled = os.environ.get("AIB_GAUSS_STREAM", "1").lower() not in ("0", "false", "")

        missing = [
            name for name, val in (
                ("AIB_GAUSS_API_URL", api_url),
                ("AIB_GAUSS_CLIENT", client_id),
                ("AIB_GAUSS_TOKEN", token),
                ("AIB_GAUSS_MODEL_IDS", model_ids_raw),
            ) if not val
        ]
        if missing:
            raise ValueError(
                f"Missing required Gauss env vars: {', '.join(missing)}. "
                "Add them to packages/backend/.env."
            )

        model_ids = [m.strip() for m in model_ids_raw.split(",") if m.strip()]
        if not model_ids:
            raise ValueError("AIB_GAUSS_MODEL_IDS must contain at least one model id.")

        turn = len(history)
        _log_request(self.name, turn, message, page, history)
        actions: list = []
        completed = False

        system_prompt = _build_system_prompt(page, history)

        endpoint = f"{api_url}{endpoint_path}"
        headers = {
            "Content-Type": "application/json",
            "x-generative-ai-client": client_id,
            "x-openapi-token": token,
        }
        if user_email:
            headers["x-generative-ai-user-email"] = user_email

        body: dict = {
            "modelIds": model_ids,
            "contents": [message],
            "isStream": stream_enabled,
            "systemPrompt": system_prompt,
        }

        async def _gen() -> AsyncIterator[str]:
            nonlocal completed
            buffer = ""
            async with httpx.AsyncClient(timeout=120.0) as client:
                if stream_enabled:
                    async with client.stream("POST", endpoint, headers=headers, json=body) as resp:
                        resp.raise_for_status()
                        async for raw_line in resp.aiter_lines():
                            text_piece = _extract_gauss_chunk_text(raw_line)
                            if not text_piece:
                                continue
                            buffer += text_piece
                            while "\n" in buffer:
                                line_part, _, buffer = buffer.partition("\n")
                                out, done_val = _parse_model_line(line_part + "\n", actions)
                                if out is not None:
                                    yield out
                                if done_val is not None:
                                    completed = done_val
                else:
                    resp = await client.post(endpoint, headers=headers, json=body)
                    resp.raise_for_status()
                    obj = resp.json()
                    buffer = obj.get("content", "") or ""
            if buffer.strip():
                out, done_val = _parse_model_line(buffer, actions)
                if out is not None:
                    yield out
                if done_val is not None:
                    completed = done_val
            yield json.dumps({"type": "done", "completed": completed})
            _log_response(self.name, turn, actions, completed)

        return _gen()


def _extract_gauss_chunk_text(raw_line: str) -> str:
    """Extract one text chunk from a streamed Gauss response line.

    Stream format: one JSON object per line, optionally SSE-wrapped as
    `data: {...}`. Field names are snake_case in stream mode. The text
    payload lives in `content`.
    """
    if not raw_line:
        return ""
    line = raw_line[5:].strip() if raw_line.startswith("data:") else raw_line.strip()
    if line in ("", "[DONE]"):
        return ""
    try:
        obj = json.loads(line)
    except json.JSONDecodeError:
        return ""
    return obj.get("content", "") or ""


_BACKENDS: dict[str, type] = {
    "mock": MockLLM,
    "gemini": GeminiLLM,
    "gauss": GaussLLM,
}


def get_llm() -> MockLLM | GeminiLLM | GaussLLM:
    name = os.environ.get("AIB_LLM_BACKEND", "mock").lower()
    cls = _BACKENDS.get(name)
    if cls is None:
        raise ValueError(f"Unknown AIB_LLM_BACKEND={name!r}. Choose from: {list(_BACKENDS)}")
    return cls()
