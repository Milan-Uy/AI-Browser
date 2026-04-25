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
        prompt = "\n".join(prompt_lines)

        model = genai.GenerativeModel("gemini-2.0-flash")

        async def _gen() -> AsyncIterator[str]:
            nonlocal completed
            response = await model.generate_content_async(prompt, stream=True)
            async for chunk in response:
                chunk_text = chunk.text if chunk.text else ""
                for line in chunk_text.splitlines(keepends=True):
                    stripped = line.strip()
                    if stripped.startswith("ACTION:"):
                        action_json = stripped[len("ACTION:"):].strip()
                        try:
                            action_obj = json.loads(action_json)
                            actions.append(action_obj)
                            yield json.dumps({"type": "action", "action": action_obj})
                        except json.JSONDecodeError:
                            yield json.dumps({"type": "text", "content": line})
                    elif stripped.upper().startswith("DONE:"):
                        done_val = stripped[5:].strip().lower()
                        completed = done_val == "true"
                    elif line:
                        yield json.dumps({"type": "text", "content": line})
            yield json.dumps({"type": "done", "completed": completed})
            _log_response(self.name, turn, actions, completed)

        return _gen()


_BACKENDS: dict[str, type] = {
    "mock": MockLLM,
    "gemini": GeminiLLM,
}


def get_llm() -> MockLLM | GeminiLLM:
    name = os.environ.get("AIB_LLM_BACKEND", "mock").lower()
    cls = _BACKENDS.get(name)
    if cls is None:
        raise ValueError(f"Unknown AIB_LLM_BACKEND={name!r}. Choose from: {list(_BACKENDS)}")
    return cls()
