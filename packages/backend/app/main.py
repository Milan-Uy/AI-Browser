import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .agent_llm import run_agent
from .schemas import AgentMessage, MessageToAgent


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

    @app.post("/agent", response_model=AgentMessage)
    async def agent(req: MessageToAgent) -> AgentMessage:
        return await run_agent(req)

    return app


app = create_app()
