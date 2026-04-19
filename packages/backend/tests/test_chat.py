import json
import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app


@pytest.mark.asyncio
async def test_healthz() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as client:
        r = await client.get("/healthz")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


@pytest.mark.asyncio
async def test_chat_streams_text_and_done() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as client:
        body = {"message": "hi", "page": None}
        async with client.stream("POST", "/chat", json=body) as r:
            assert r.status_code == 200
            lines = [line async for line in r.aiter_lines()]
    data_lines = [l[5:].strip() for l in lines if l.startswith("data:")]
    parsed = [json.loads(x) for x in data_lines if x]
    assert any(p["type"] == "text" for p in parsed)
    assert parsed[-1]["type"] == "done"


@pytest.mark.asyncio
async def test_chat_with_page_emits_action() -> None:
    page = {
        "url": "https://example.com",
        "title": "Example",
        "text": "hello",
        "elements": [
            {"selector": "#go", "tag": "button", "text": "Go"},
        ],
    }
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as client:
        async with client.stream("POST", "/chat", json={"message": "click go", "page": page}) as r:
            data_lines = [l[5:].strip() async for l in r.aiter_lines() if l.startswith("data:")]
    parsed = [json.loads(x) for x in data_lines if x]
    actions = [p for p in parsed if p.get("type") == "action"]
    assert len(actions) == 1
    assert actions[0]["action"]["kind"] == "click"
    assert actions[0]["action"]["selector"] == "#go"
