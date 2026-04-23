import logging
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sse_starlette.sse import EventSourceResponse

from .llm import get_llm
from .schemas import ChatRequest

logging.basicConfig(
    level=os.environ.get("AIB_LOG_LEVEL", "INFO"),
    format="%(message)s",
)


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
        llm = get_llm()

        async def event_gen():
            stream = await llm.stream(req.message, req.page, req.history)
            async for chunk in stream:
                yield {"data": chunk}

        return EventSourceResponse(event_gen())

    return app


app = create_app()
