import json
import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app


LOGIN_PAGE = {
    "url": "https://example.com/login",
    "title": "Login",
    "text": "Please log in",
    "elements": [
        {"selector": "#email", "tag": "input", "text": "", "type": "email", "placeholder": "Email"},
        {"selector": "#password", "tag": "input", "text": "", "type": "password", "placeholder": "Password"},
        {"selector": "#submit", "tag": "button", "text": "Log In"},
    ],
}


async def _collect_chunks(client: AsyncClient, body: dict) -> list[dict]:
    async with client.stream("POST", "/chat", json=body) as r:
        assert r.status_code == 200
        data_lines = [l[5:].strip() async for l in r.aiter_lines() if l.startswith("data:")]
    return [json.loads(x) for x in data_lines if x]


@pytest.mark.asyncio
async def test_healthz() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as client:
        r = await client.get("/healthz")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


@pytest.mark.asyncio
async def test_chat_streams_text_and_done() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as client:
        parsed = await _collect_chunks(client, {"message": "hi", "page": None})
    assert any(p["type"] == "text" for p in parsed)
    assert parsed[-1]["type"] == "done"


@pytest.mark.asyncio
async def test_chat_with_page_emits_fill_on_turn0() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as client:
        parsed = await _collect_chunks(client, {"message": "log me in", "page": LOGIN_PAGE})
    actions = [p for p in parsed if p.get("type") == "action"]
    assert len(actions) == 1
    assert actions[0]["action"]["kind"] == "fill"
    assert actions[0]["action"]["selector"] == "#email"
    done = parsed[-1]
    assert done["type"] == "done"
    assert done["completed"] is False


@pytest.mark.asyncio
async def test_chat_multi_turn_login_sequence() -> None:
    """Three turns: fill email → fill password → click submit."""
    history = []
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as client:
        # Turn 0: fill email
        body = {"message": "log me in", "page": LOGIN_PAGE, "history": history}
        turn0 = await _collect_chunks(client, body)
        actions0 = [p["action"] for p in turn0 if p.get("type") == "action"]
        assert len(actions0) == 1
        assert actions0[0]["kind"] == "fill"
        assert actions0[0]["selector"] == "#email"
        assert turn0[-1]["completed"] is False
        history.append({"actions": actions0, "page": LOGIN_PAGE})

        # Turn 1: fill password
        body = {"message": "log me in", "page": LOGIN_PAGE, "history": history}
        turn1 = await _collect_chunks(client, body)
        actions1 = [p["action"] for p in turn1 if p.get("type") == "action"]
        assert len(actions1) == 1
        assert actions1[0]["kind"] == "fill"
        assert actions1[0]["selector"] == "#password"
        assert turn1[-1]["completed"] is False
        history.append({"actions": actions1, "page": LOGIN_PAGE})

        # Turn 2: click submit
        body = {"message": "log me in", "page": LOGIN_PAGE, "history": history}
        turn2 = await _collect_chunks(client, body)
        actions2 = [p["action"] for p in turn2 if p.get("type") == "action"]
        assert len(actions2) == 1
        assert actions2[0]["kind"] == "click"
        assert actions2[0]["selector"] == "#submit"
        assert turn2[-1]["completed"] is True


@pytest.mark.asyncio
async def test_chat_no_login_form_completes_immediately() -> None:
    page = {
        "url": "https://example.com",
        "title": "Home",
        "text": "Welcome",
        "elements": [{"selector": "#go", "tag": "button", "text": "Go"}],
    }
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as client:
        parsed = await _collect_chunks(client, {"message": "log me in", "page": page})
    assert parsed[-1]["type"] == "done"
    assert parsed[-1]["completed"] is True
