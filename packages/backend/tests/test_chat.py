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
async def test_agent_without_page_returns_completed() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as client:
        r = await client.post("/agent", json={"userPrompt": "hi"})
    assert r.status_code == 200
    body = r.json()
    assert body["completed"] is True
    assert "explanation" in body


@pytest.mark.asyncio
async def test_agent_with_page_emits_click_step() -> None:
    page = {
        "interactiveElements": {
            "button": [
                {
                    "id": 1,
                    "role": "button",
                    "name": "Go",
                    "tagName": "button",
                    "bounds": {"x": 0, "y": 0, "width": 50, "height": 20},
                }
            ]
        },
        "interactiveElementsString": "# button\n[1] button \"Go\"",
        "tab": {"id": 1, "title": "Example", "url": "https://example.com"},
        "timestamp": "2026-04-21T00:00:00Z",
    }
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as client:
        r = await client.post(
            "/agent",
            json={"userPrompt": "click go", "pageState": page},
        )
    assert r.status_code == 200
    body = r.json()
    assert body["completed"] is False
    assert body["steps"][0]["action"] == "click"
    assert body["steps"][0]["id"] == 1


@pytest.mark.asyncio
async def test_agent_completes_after_successful_feedback() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as client:
        r = await client.post(
            "/agent",
            json={
                "userPrompt": "click go",
                "feedback": {"batchNumber": 1, "success": True},
            },
        )
    body = r.json()
    assert body["completed"] is True


PAGE_WITH_GO_BUTTON = {
    "interactiveElements": {
        "button": [
            {
                "id": 1,
                "role": "button",
                "name": "Go",
                "tagName": "button",
                "bounds": {"x": 0, "y": 0, "width": 50, "height": 20},
            }
        ]
    },
    "interactiveElementsString": "# button\n[1] button \"Go\"",
    "tab": {"id": 1, "title": "Example", "url": "https://example.com"},
    "timestamp": "2026-04-21T00:00:00Z",
}


@pytest.mark.asyncio
async def test_agent_stops_on_denied_by_user_reason() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as client:
        r = await client.post(
            "/agent",
            json={
                "userPrompt": "click go",
                "pageState": PAGE_WITH_GO_BUTTON,
                "feedback": {
                    "batchNumber": 1,
                    "success": False,
                    "reason": "denied_by_user",
                },
            },
        )
    body = r.json()
    assert body["completed"] is True
    assert not body.get("steps")
    assert "denied" in (body.get("explanation") or "").lower()


@pytest.mark.asyncio
async def test_agent_stops_on_denied_by_user_in_step_results() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as client:
        r = await client.post(
            "/agent",
            json={
                "userPrompt": "click go",
                "pageState": PAGE_WITH_GO_BUTTON,
                "feedback": {
                    "batchNumber": 1,
                    "success": False,
                    "stepResults": [
                        {"stepNumber": 1, "success": False, "error": "denied by user"}
                    ],
                },
            },
        )
    body = r.json()
    assert body["completed"] is True
    assert not body.get("steps")


@pytest.mark.asyncio
async def test_agent_does_not_stop_on_non_denial_failure() -> None:
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as client:
        r = await client.post(
            "/agent",
            json={
                "userPrompt": "click go",
                "pageState": PAGE_WITH_GO_BUTTON,
                "feedback": {
                    "batchNumber": 1,
                    "success": False,
                    "stepResults": [
                        {"stepNumber": 1, "success": False, "error": "element not found"}
                    ],
                },
            },
        )
    body = r.json()
    assert body["completed"] is False
    assert body["steps"][0]["action"] == "click"
