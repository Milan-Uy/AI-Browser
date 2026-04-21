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
AIB_LLM_BACKEND=mock   # deterministic mock (default)
AIB_LLM_BACKEND=real   # real LLM (implement _real_agent in app/agent_llm.py)
```

## Architecture

### Monorepo layout

- `packages/browser-extension/` — WXT + React 18 + TypeScript + Tailwind Chrome extension (MV3)
- `packages/backend/` — FastAPI backend; mock LLM by default, real LLM via `AIB_LLM_BACKEND=real`

### Three extension contexts and how they connect

```
Side Panel (React)  ←── chrome.runtime.Port "chat" ──→  Background SW
                                                               │
                                                    chrome.tabs.sendMessage
                                                               │
                                                         Content Script
```

- **Side Panel** (`entrypoints/sidepanel/`) — React UI. Opens as Chrome side panel. Communicates with background exclusively via a long-lived `chrome.runtime.Port` named `"chat"`.
- **Background SW** (`entrypoints/background.ts`) — Orchestrator. Owns the agent loop: fetches `PageState`, calls `POST /agent`, executes `Step[]` batches through the confirm/rate-limit pipeline, posts `FeedbackMessage` for multi-turn continuation.
- **Content Script** (`entrypoints/content.ts`) — DOM reader and actuator. Responds to `GET_PAGE_STATE` (runs extractor, keeps `idMap`) and `EXECUTE_STEP` (looks up element by numeric id, runs action).

### Typed message protocol (`lib/messaging.ts`)

All cross-context messages use the `AppMessage` discriminated union keyed by `MessageKind`. Never use raw `chrome.runtime.sendMessage` — use `sendRuntime` / `sendToTab` / `port.postMessage` with `makeMessage`. Use `isMessageOfKind` for type-narrowed dispatch.

The 8 message kinds: `GET_PAGE_STATE`, `PAGE_STATE_RESULT`, `CHAT_MESSAGE`, `AGENT_UPDATE`, `CONFIRM_STEP`, `STEP_APPROVED`, `EXECUTE_STEP`, `EXECUTE_STEP_RESULT`.

Key shared types: `PageState`, `InteractiveElementsMap`, `BrowserElementData`, `ElementBounds`, `ElementState`, `Step`, `AgentMessage`, `StepFeedback`, `FeedbackMessage`, `MessageToAgent`.

### Page state extraction (`lib/page-extractor.ts`)

`extractPageState()` returns `{ pageState, idMap }`. Elements are:
- Resolved to an ARIA role (explicit `role` attribute → implicit role from tag/type)
- Filtered to `INTERACTIVE_AX_ROLES` only; zero-size, hidden, and password inputs are skipped
- Assigned a monotonic numeric `id` starting at 1
- Named via the accessible-name algorithm (aria-label → labelledby → `<label>` → innerText → placeholder)
- Grouped into `InteractiveElementsMap` keyed by role
- Flattened into `interactiveElementsString`: `[id] role "name" k=v …` lines under `# role` headers

The `idMap: Map<number, HTMLElement>` is kept only in the content script (not serialized) and consumed by `executeStep` for element lookup.

### Agent confirmation flow

Every Step from the LLM goes through this pipeline in `background.ts` before touching the DOM:

1. `validateStep()` — URL scheme allowlist for `navigate`; action kind whitelist (`lib/security.ts`)
2. `rateLimiter.acquire()` — 500 ms minimum between steps
3. `waitForApproval()` — posts `CONFIRM_STEP` to side panel port; blocks until `STEP_APPROVED` resolves (or port disconnects → auto-deny)
4. `sendToTab(EXECUTE_STEP)` → content script → `executeStep(step, idMap)` in `lib/dom-actions.ts`

After all steps in a batch, background re-extracts `PageState` and sends a `FeedbackMessage` back to the backend. Loop continues until `AgentMessage.completed` is true or 10 turns.

### Agent API (`lib/api-client.ts`)

`callAgent(endpoint, MessageToAgent, signal)` — single POST returning `AgentMessage` (plain JSON, not SSE). Retries once on 5xx. The backend endpoint is `POST /agent`.

### Backend (`packages/backend/`)

`POST /agent` accepts `MessageToAgent` (`userPrompt`, optional `pageState`, optional `feedback`) and returns `AgentMessage` (plain JSON). CORS is locked to `chrome-extension://*` by default; override with `AIB_ALLOW_ORIGINS` env var.

LLM logic lives in `app/agent_llm.py`:
- `mock`: deterministic — finds an element name matching `userPrompt` keywords, emits one click step.
- `real`: stub — implement `_real_agent()` with your custom LLM call. The system prompt should instruct the LLM to output an `AgentMessage` JSON object and consume `pageState.interactiveElementsString` verbatim.

### Tests

TypeScript tests live in `packages/browser-extension/lib/__tests__/` and run in `happy-dom`. They cover all five `lib/` modules. WXT entrypoints (`background.ts`, `content.ts`, React components) are not unit-tested — load the built extension in `chrome://extensions` (developer mode) for integration testing.

Backend tests are in `packages/backend/tests/test_chat.py` and run with pytest.
