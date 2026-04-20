import asyncio
import json
from typing import AsyncIterator, Optional
from .schemas import PageContent


async def mock_stream(message: str, page: Optional[PageContent]) -> AsyncIterator[str]:
    """Emit a deterministic sequence of SSE 'data:' payloads."""
    intro = f"Thinking about: {message!r}. "
    if page:
        intro += f"I see {len(page.elements)} interactive elements on '{page.title}'. "

    for word in intro.split(" "):
        await asyncio.sleep(0.03)
        yield json.dumps({"type": "text", "content": word + " "})

    button = next(
        (e for e in (page.elements if page else []) if e.tag in ("button", "a")),
        None,
    )
    if button:
        await asyncio.sleep(0.1)
        yield json.dumps({"type": "text", "content": f"I'd like to click '{button.text or button.selector}'. "})
        await asyncio.sleep(0.1)
        yield json.dumps({"type": "action", "action": {"kind": "click", "selector": button.selector}})

    yield json.dumps({"type": "done"})
