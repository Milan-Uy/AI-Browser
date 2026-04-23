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
        # TODO: implement Gemini API call here.
        # Set AIB_LLM_BACKEND=gemini and GEMINI_API_KEY to enable.
        raise NotImplementedError(
            "GeminiLLM is not yet implemented. "
            "Add your Gemini API call in packages/backend/app/llm.py GeminiLLM.stream()"
        )


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
