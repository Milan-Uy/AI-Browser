import asyncio
import json
import re
from typing import AsyncIterator, Optional

from .schemas import PageContent


_LOGIN_RE = re.compile(r"\b(log\s*in|sign\s*in)\b", re.I)


def _is_login_message(message: str) -> bool:
    return bool(_LOGIN_RE.search(message or ""))


def _find_email_field(elements: list):
    for e in elements:
        if e.type == "email":
            return e
        if e.tag == "input" and re.search(r"email|user", (e.placeholder or "") + (e.text or ""), re.I):
            return e
    return None


def _find_password_field(elements: list):
    for e in elements:
        if e.type == "password":
            return e
    return None


def _find_submit_button(elements: list):
    for e in elements:
        if e.tag in ("button", "input") and re.search(r"log\s*in|sign\s*in|submit", e.text or "", re.I):
            return e
    # fallback: any button
    for e in elements:
        if e.tag in ("button", "a"):
            return e
    return None


async def mock_stream(message: str, page: Optional[PageContent], turn: int = 0) -> AsyncIterator[str]:
    elements = page.elements if page else []

    if turn == 0:
        if not _is_login_message(message):
            yield json.dumps({"type": "text", "content": "Type \"login\" to have me fill in the demo credentials. "})
            yield json.dumps({"type": "done", "completed": True})
            return
        el = _find_email_field(elements)
        if el is not None:
            action: dict = {"kind": "fill", "index": el.index, "value": "test", "description": "email/username field"}
            if el.role:
                action["role"] = el.role
            if el.name:
                action["name"] = el.name
            yield json.dumps({"type": "text", "content": "Filling in the email/username field. "})
            await asyncio.sleep(0.05)
            yield json.dumps({"type": "action", "action": action})
            await asyncio.sleep(0.05)
            yield json.dumps({"type": "done", "completed": False})
        else:
            yield json.dumps({"type": "text", "content": "No email or username field found on this page. "})
            yield json.dumps({"type": "done", "completed": True})

    elif turn == 1:
        el = _find_password_field(elements)
        if el is not None:
            action = {"kind": "fill", "index": el.index, "value": "test", "description": "password field"}
            if el.role:
                action["role"] = el.role
            if el.name:
                action["name"] = el.name
            yield json.dumps({"type": "text", "content": "Filling in the password field. "})
            await asyncio.sleep(0.05)
            yield json.dumps({"type": "action", "action": action})
            await asyncio.sleep(0.05)
            yield json.dumps({"type": "done", "completed": False})
        else:
            yield json.dumps({"type": "text", "content": "No password field found. "})
            yield json.dumps({"type": "done", "completed": True})

    elif turn == 2:
        el = _find_submit_button(elements)
        if el is not None:
            action = {"kind": "click", "index": el.index, "description": "submit button"}
            if el.role:
                action["role"] = el.role
            if el.name:
                action["name"] = el.name
            yield json.dumps({"type": "text", "content": "Clicking the submit button. "})
            await asyncio.sleep(0.05)
            yield json.dumps({"type": "action", "action": action})
            await asyncio.sleep(0.05)
            yield json.dumps({"type": "done", "completed": True})
        else:
            yield json.dumps({"type": "text", "content": "Could not find a submit button. "})
            yield json.dumps({"type": "done", "completed": True})

    else:
        yield json.dumps({"type": "text", "content": "Task complete. "})
        yield json.dumps({"type": "done", "completed": True})
