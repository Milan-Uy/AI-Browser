# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

All commands run from the repo root unless noted.

### Browser Extension

```bash
pnpm ext:dev          # WXT dev server with HMR (Chrome)
pnpm ext:build        # Production build → packages/browser-extension/.output/chrome-mv3/
pnpm ext:test         # Vitest run (all lib/__tests__)
pnpm --filter browser-extension test:watch  # Watch mode
pnpm --filter browser-extension compile     # tsc --noEmit (type check only)
```

Run a single test file:
```bash
pnpm --filter browser-extension exec vitest run lib/__tests__/messaging.test.ts
```

### Backend

```bash
pnpm backend:dev      # uvicorn with --reload on port 8000
# From packages/backend:
pip install -e ".[dev]"
pytest                # All tests
pytest tests/test_chat.py::test_healthz  # Single test
```

Backend LLM selection (env var):
```bash
AIB_LLM_BACKEND=mock    # turn-aware mock (default)
AIB_LLM_BACKEND=gemini  # Gemini — implement GeminiLLM.stream() in app/llm.py
```

LLM request/response logging:
```bash
AIB_LOG_LEVEL=DEBUG        # verbose output
AIB_LOG_LLM_FULL=1         # dump full page text + history in log lines (otherwise truncated)
```

## Architecture

### Monorepo layout

- `packages/browser-extension/` — WXT + React 18 + TypeScript + Tailwind Chrome extension (MV3)
- `packages/backend/` — FastAPI backend; turn-aware mock LLM by default, swappable via `AIB_LLM_BACKEND`

### Three extension contexts and how they connect

```
Side Panel (React)  ←── chrome.runtime.Port "chat" ──→  Background SW
                                                               │
                                                    chrome.tabs.sendMessage
                                                               │
                                                         Content Script
```

- **Side Panel** (`entrypoints/sidepanel/`) — React UI. Opens as Chrome side panel. Communicates with background exclusively via a long-lived `chrome.runtime.Port` named `"chat"`.
- **Background SW** (`entrypoints/background.ts`) — Orchestrator. Owns the agent loop: asks for one-time run approval, then loops up to 10 turns — fetches `PageContent`, calls `POST /chat`, executes actions through the validate/rate-limit pipeline, accumulates `TurnRecord` history for the next turn. Stops when backend signals `completed: true` or no actions were executed.
- **Content Script** (`entrypoints/content.ts`) — DOM reader and actuator. Responds to `GET_PAGE_CONTENT` (runs extractor) and `EXECUTE_ACTION` (runs action dispatcher).

### Typed message protocol (`lib/messaging.ts`)

All cross-context messages use the `AppMessage` discriminated union keyed by `MessageKind`. Never use raw `chrome.runtime.sendMessage` — use `sendRuntime` / `sendToTab` / `port.postMessage` with `makeMessage`. Use `isMessageOfKind` for type-narrowed dispatch.

The 8 message kinds: `GET_PAGE_CONTENT`, `PAGE_CONTENT_RESULT`, `CHAT_MESSAGE`, `STREAM_CHUNK`, `CONFIRM_RUN`, `RUN_APPROVED`, `EXECUTE_ACTION`, `EXECUTE_ACTION_RESULT`.

Key shared types: `PageContent`, `InteractiveElement`, `LLMAction`, `TurnRecord`, `StreamChunk`, `ActionResult`.

### Page content extraction (`lib/page-extractor.ts`)

`extractPageContent()` returns a `PageContent` snapshot with:
- `url`, `title`, `text` (visible text), optional `selection`
- `elements` — interactive elements, each with `selector`, `tag`, `text`, optional `type` and `placeholder`

### Agent confirmation flow

On each `CHAT_MESSAGE`, background runs this pipeline:

1. `waitForRunApproval()` — posts `CONFIRM_RUN` to side panel port; blocks until `RUN_APPROVED` resolves (or port disconnects → auto-deny). **One confirmation per run, not per action.**
2. Agent loop (max 10 turns):
   - Fetch `PageContent` from active tab.
   - `POST /chat` with `{ message, page, history }`, stream response.
   - For each `action` chunk: `validateAction()` (URL scheme allowlist, selector deny-list) → `rateLimiter.acquire()` (500 ms minimum) → `sendToTab(EXECUTE_ACTION)` → content script → `executeAction()` in `lib/dom-actions.ts`.
   - On `done` chunk: if `completed === true` or no actions executed this turn, exit loop. Otherwise push `TurnRecord` onto history and continue.

### Agent API (`lib/api-client.ts`)

`streamChat(endpoint, ChatRequest, signal)` — POSTs `{ message, page, history }` and yields parsed SSE `StreamChunk`s. Retries once on 5xx. The backend endpoint is `POST /chat`.

### Backend (`packages/backend/`)

`POST /chat` accepts `ChatRequest` (`message`, optional `page: PageContent`, `history: TurnRecord[]`) and streams `StreamChunk` JSON via SSE. CORS is locked to `chrome-extension://*` by default; override with `AIB_ALLOW_ORIGINS` env var.

LLM abstraction lives in `app/llm.py`:
- `get_llm()` reads `AIB_LLM_BACKEND` and returns the appropriate backend.
- `MockLLM` wraps `mock_stream()` in `mock_llm.py` — turn-aware: turn 0 fills email/username, turn 1 fills password, turn 2 clicks submit.
- `GeminiLLM` stub — raises `NotImplementedError`; implement `GeminiLLM.stream()` and set `AIB_LLM_BACKEND=gemini` + `GEMINI_API_KEY`.
- Both backends log structured JSON (`llm_request` / `llm_response`) to stdout per turn.

### Tests

TypeScript tests live in `packages/browser-extension/lib/__tests__/` and run in `happy-dom`. They cover all five `lib/` modules. WXT entrypoints (`background.ts`, `content.ts`, React components) are not unit-tested — load the built extension in `chrome://extensions` (developer mode) for integration testing.

Backend tests are in `packages/backend/tests/test_chat.py` and run with pytest. They cover `/healthz`, single-turn SSE streaming, the full 3-turn login sequence (email → password → submit), and early-exit when no form is found.
