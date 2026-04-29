import json
import httpx
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
        parsed = await _collect_chunks(client, {"message": "login", "page": LOGIN_PAGE})
    actions = [p for p in parsed if p.get("type") == "action"]
    assert len(actions) == 1
    assert actions[0]["action"]["kind"] == "fill"
    assert actions[0]["action"]["selector"] == "#email"
    assert actions[0]["action"]["value"] == "test"
    done = parsed[-1]
    assert done["type"] == "done"
    assert done["completed"] is False


@pytest.mark.asyncio
async def test_chat_multi_turn_login_sequence() -> None:
    """Three turns: fill email → fill password → click submit."""
    history = []
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as client:
        # Turn 0: fill email
        body = {"message": "login", "page": LOGIN_PAGE, "history": history}
        turn0 = await _collect_chunks(client, body)
        actions0 = [p["action"] for p in turn0 if p.get("type") == "action"]
        assert len(actions0) == 1
        assert actions0[0]["kind"] == "fill"
        assert actions0[0]["selector"] == "#email"
        assert actions0[0]["value"] == "test"
        assert turn0[-1]["completed"] is False
        history.append({"actions": actions0, "page": LOGIN_PAGE})

        # Turn 1: fill password
        body = {"message": "login", "page": LOGIN_PAGE, "history": history}
        turn1 = await _collect_chunks(client, body)
        actions1 = [p["action"] for p in turn1 if p.get("type") == "action"]
        assert len(actions1) == 1
        assert actions1[0]["kind"] == "fill"
        assert actions1[0]["selector"] == "#password"
        assert actions1[0]["value"] == "test"
        assert turn1[-1]["completed"] is False
        history.append({"actions": actions1, "page": LOGIN_PAGE})

        # Turn 2: click submit
        body = {"message": "login", "page": LOGIN_PAGE, "history": history}
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
        parsed = await _collect_chunks(client, {"message": "login", "page": page})
    assert parsed[-1]["type"] == "done"
    assert parsed[-1]["completed"] is True


@pytest.mark.asyncio
async def test_chat_non_login_message_skips_form() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as client:
        parsed = await _collect_chunks(client, {"message": "what's on this page?", "page": LOGIN_PAGE})
    actions = [p for p in parsed if p.get("type") == "action"]
    assert actions == []
    assert parsed[-1]["type"] == "done"
    assert parsed[-1]["completed"] is True


@pytest.mark.asyncio
async def test_gauss_backend_streams_action_and_done(monkeypatch: pytest.MonkeyPatch) -> None:
    """GaussLLM: end-to-end streaming through /chat with a mocked HTTP transport."""
    monkeypatch.setenv("AIB_LLM_BACKEND", "gauss")
    monkeypatch.setenv("AIB_GAUSS_API_URL", "https://fake-gauss.example.com")
    monkeypatch.setenv("AIB_GAUSS_CLIENT", "fake-client")
    monkeypatch.setenv("AIB_GAUSS_TOKEN", "fake-token")
    monkeypatch.setenv("AIB_GAUSS_MODEL_IDS", "gauss-pro,gauss-mini")
    monkeypatch.setenv("AIB_GAUSS_USER_EMAIL", "qa@example.com")

    captured: dict = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["url"] = str(request.url)
        captured["headers"] = dict(request.headers)
        captured["body"] = json.loads(request.content)
        sse_body = (
            b'data: {"content": "Filling the email field.\\n", "finish_reason": null}\n\n'
            b'data: {"content": "ACTION: {\\"kind\\": \\"fill\\", \\"selector\\": \\"#email\\", \\"value\\": \\"x\\"}\\n", "finish_reason": null}\n\n'
            b'data: {"content": "DONE: false\\n", "finish_reason": "stop"}\n\n'
            b'data: [DONE]\n\n'
        )
        return httpx.Response(200, content=sse_body, headers={"content-type": "text/event-stream"})

    original_client = httpx.AsyncClient

    def patched_client(*args, **kwargs):  # type: ignore[no-untyped-def]
        kwargs["transport"] = httpx.MockTransport(handler)
        return original_client(*args, **kwargs)

    monkeypatch.setattr(httpx, "AsyncClient", patched_client)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as client:
        parsed = await _collect_chunks(client, {"message": "login", "page": LOGIN_PAGE})

    assert captured["url"] == "https://fake-gauss.example.com/openapi/chat/v1/messages"
    assert captured["headers"]["x-generative-ai-client"] == "fake-client"
    assert captured["headers"]["x-openapi-token"] == "fake-token"
    assert captured["headers"]["x-generative-ai-user-email"] == "qa@example.com"
    assert captured["body"]["modelIds"] == ["gauss-pro", "gauss-mini"]
    assert captured["body"]["isStream"] is True
    assert captured["body"]["contents"] == ["login"]
    assert "AI browser assistant" in captured["body"]["systemPrompt"]

    actions = [p for p in parsed if p.get("type") == "action"]
    assert len(actions) == 1
    assert actions[0]["action"] == {"kind": "fill", "selector": "#email", "value": "x"}
    assert parsed[-1] == {"type": "done", "completed": False}


@pytest.mark.asyncio
async def test_gauss_backend_buffers_action_split_across_chunks(monkeypatch: pytest.MonkeyPatch) -> None:
    """ACTION lines must be parsed even when fragmented across stream chunks."""
    monkeypatch.setenv("AIB_LLM_BACKEND", "gauss")
    monkeypatch.setenv("AIB_GAUSS_API_URL", "https://fake-gauss.example.com")
    monkeypatch.setenv("AIB_GAUSS_CLIENT", "fake-client")
    monkeypatch.setenv("AIB_GAUSS_TOKEN", "fake-token")
    monkeypatch.setenv("AIB_GAUSS_MODEL_IDS", "gauss-pro")

    def handler(request: httpx.Request) -> httpx.Response:
        sse_body = (
            b'data: {"content": "AC", "finish_reason": null}\n\n'
            b'data: {"content": "TION: {\\"kind\\":", "finish_reason": null}\n\n'
            b'data: {"content": " \\"click\\", \\"selector\\": \\"#go\\"}\\n", "finish_reason": null}\n\n'
            b'data: {"content": "DO", "finish_reason": null}\n\n'
            b'data: {"content": "NE: tr", "finish_reason": null}\n\n'
            b'data: {"content": "ue\\n", "finish_reason": "stop"}\n\n'
            b'data: [DONE]\n\n'
        )
        return httpx.Response(200, content=sse_body, headers={"content-type": "text/event-stream"})

    original_client = httpx.AsyncClient

    def patched_client(*args, **kwargs):  # type: ignore[no-untyped-def]
        kwargs["transport"] = httpx.MockTransport(handler)
        return original_client(*args, **kwargs)

    monkeypatch.setattr(httpx, "AsyncClient", patched_client)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as client:
        parsed = await _collect_chunks(client, {"message": "go", "page": LOGIN_PAGE})

    actions = [p for p in parsed if p.get("type") == "action"]
    assert len(actions) == 1
    assert actions[0]["action"] == {"kind": "click", "selector": "#go"}
    assert parsed[-1] == {"type": "done", "completed": True}


@pytest.mark.asyncio
async def test_gauss_backend_requires_env_vars(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.llm import GaussLLM

    for var in ("AIB_GAUSS_API_URL", "AIB_GAUSS_CLIENT", "AIB_GAUSS_TOKEN", "AIB_GAUSS_MODEL_IDS"):
        monkeypatch.delenv(var, raising=False)

    with pytest.raises(ValueError, match="AIB_GAUSS_API_URL"):
        await GaussLLM().stream("hi", None, [])
