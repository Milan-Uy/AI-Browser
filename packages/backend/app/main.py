import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sse_starlette.sse import EventSourceResponse

from .mock_llm import mock_stream
from .schemas import ChatRequest


def create_app() -> FastAPI:
    app = FastAPI(title="AI Browser Backend")

    allow_origins = os.environ.get("AIB_ALLOW_ORIGINS", "").split(",")
    allow_origins = [o.strip() for o in allow_origins if o.strip()] or [
        "chrome-extension://*",
    ]

    app.add_middleware(
        CORSMiddleware,
        allow_origins=allow_origins,
        allow_origin_regex=r"chrome-extension://.*",
        allow_methods=["POST", "OPTIONS"],
        allow_headers=["Content-Type"],
    )

    @app.get("/healthz")
    async def healthz() -> dict[str, str]:
        return {"status": "ok"}

    @app.post("/chat")
    async def chat(req: ChatRequest) -> EventSourceResponse:
        async def event_gen():
            async for chunk in mock_stream(req.message, req.page):
                yield {"data": chunk}

        return EventSourceResponse(event_gen())

    return app


app = create_app()
