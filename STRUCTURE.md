# Repo Structure

A tour of what lives where in this repo. For setup, see [`README.md`](./README.md); for architecture and data-flow, see [`AI-Browser.md`](./AI-Browser.md).

This is a pnpm monorepo with two packages:

- [`packages/browser-extension`](#packagesbrowser-extension) — Chrome extension (WXT + React + TypeScript)
- [`packages/backend`](#packagesbackend) — FastAPI mock-LLM server (Python ≥3.11)

---

## Repo root

| Path | Purpose |
|------|---------|
| `package.json` | Workspace manifest; top-level `ext:*` and `backend:*` scripts. |
| `pnpm-workspace.yaml` | Declares `packages/*` as the workspace root. |
| `README.md` | Quick start: install, dev servers, backend venv setup. |
| `AI-Browser.md` | Architecture plan, tech-stack rationale, data-flow diagram, security policies. |
| `STRUCTURE.md` | This file — navigational map of the repo. |
| `.nvmrc` | Pins Node 20. |
| `.gitignore` | Ignores `node_modules`, build outputs, Python venvs, `.env`. |

---

## `packages/browser-extension/`

Chrome MV3 extension. WXT generates the manifest from `wxt.config.ts` and each file under `entrypoints/` becomes a context (background worker, content script, side panel).

### Config

| Path | Purpose |
|------|---------|
| `wxt.config.ts` | Manifest: permissions (`sidePanel`, `tabs`, `activeTab`, `scripting`, `storage`), host permissions, side-panel default path. |
| `tsconfig.json` | Strict TS, React JSX, `@/*` path alias. |
| `vitest.config.ts` | happy-dom env, tests under `lib/__tests__/`. |
| `package.json` | `dev`, `build`, `compile`, `test` scripts. |

### `entrypoints/`

| Path | Purpose |
|------|---------|
| `background.ts` | Orchestrator service worker. Holds the port to the side panel, fetches page content from the active tab, POSTs to the backend, parses SSE chunks, gates actions through user confirmation, and dispatches approved actions to the content script. |
| `content.ts` | Per-tab content script (matches `<all_urls>`, `document_idle`). Handles `GET_PAGE_CONTENT` (runs the extractor) and `EXECUTE_ACTION` (runs the action dispatcher). |
| `sidepanel/index.html` | HTML shell for the side panel. |
| `sidepanel/main.tsx` | Mounts `<App/>` to `#root`. |
| `sidepanel/App.tsx` | Renders `<ChatPanel/>`. |
| `sidepanel/style.css` | Tailwind directives + custom styles. |

#### `entrypoints/sidepanel/components/`

| Path | Purpose |
|------|---------|
| `ChatPanel.tsx` | Top-level UI: message feed, input form, page-context badge, action dialog. |
| `MessageBubble.tsx` | Renders a single message; streams tokens as they arrive. |
| `ActionConfirmDialog.tsx` | Allow/Deny prompt shown when the LLM proposes an action. |
| `PageContextBadge.tsx` | Shows page title / URL / element count with a Refresh button and include-page toggle. |

#### `entrypoints/sidepanel/hooks/`

| Path | Purpose |
|------|---------|
| `useChat.ts` | Owns the chat port, message list, pending state, and `pendingAction`. Exposes `send()` and `decideAction()`. |
| `usePageContent.ts` | Requests a fresh `PageContent` from the active tab; exposes `content`, `loading`, `refresh()`. |

### `lib/`

| Path | Purpose |
|------|---------|
| `messaging.ts` | Typed discriminated-union message protocol; shared models (`PageContent`, `InteractiveElement`, `LLMAction`, `StreamChunk`); helpers (`makeMessage`, `isMessageOfKind`, `sendRuntime`, `sendToTab`). |
| `api-client.ts` | `streamChat()` async generator — POSTs a `ChatRequest` and yields parsed SSE `StreamChunk`s. |
| `page-extractor.ts` | DOM snapshot: `extractPageContent()` (URL, title, text, selection, interactive elements) and `buildUniqueSelector()`. |
| `dom-actions.ts` | `executeAction()` dispatcher for `click` / `fill` / `select` / `scroll` / `navigate`. |
| `security.ts` | `validateAction()` (URL scheme allowlist, selector deny-list) and `createRateLimiter()`. |
| `__tests__/` | Vitest suites — one file per `lib/` module. |

### `public/`

| Path | Purpose |
|------|---------|
| `icons/` | Extension icon assets bundled into the build. |

---

## `packages/backend/`

FastAPI server exposing a streaming `/chat` endpoint. Currently a mock LLM; designed to be swapped for a real model.

### Config

| Path | Purpose |
|------|---------|
| `pyproject.toml` | Dependencies (`fastapi`, `uvicorn`, `sse-starlette`, `pydantic`), dev deps (`pytest`, `httpx`, `anyio`), pytest config. |

### `app/`

| Path | Purpose |
|------|---------|
| `main.py` | `create_app()` factory; CORS (restricted to `chrome-extension://*`); `GET /healthz`; `POST /chat` returning `EventSourceResponse`. |
| `schemas.py` | Pydantic models: `ChatRequest`, `PageContent`, `InteractiveElement`, and the `Action` union (`ClickAction`, `FillAction`, `ScrollAction`, `NavigateAction`, `SelectAction`). |
| `mock_llm.py` | `mock_stream()` async generator emitting `text` / `action` / `done` chunks, keyed off the incoming page context. |

### `tests/`

| Path | Purpose |
|------|---------|
| `test_chat.py` | Covers `/healthz`, SSE text + done termination, and that a page with a button triggers a `click` action chunk. |

---

## How the pieces talk

- **Side panel ↔ background** — long-lived `chrome.runtime.connect({ name: "chat" })` port for chat traffic; plain `chrome.runtime.sendMessage` for one-shot requests like `GET_PAGE_CONTENT`.
- **Background ↔ content script** — `chrome.tabs.sendMessage` request/response (`GET_PAGE_CONTENT`, `EXECUTE_ACTION`).
- **Background → backend** — `fetch` POST `http://localhost:8000/chat`, response parsed as SSE.

Full sequence (chat message → page capture → backend → action approval → DOM mutation) is diagrammed in [`AI-Browser.md`](./AI-Browser.md).

---

## Where to look for…

| Task | Start here |
|------|------------|
| Change the chat UI | `packages/browser-extension/entrypoints/sidepanel/components/ChatPanel.tsx` |
| Add a new action kind | `lib/messaging.ts` (type) → `lib/dom-actions.ts` (impl) → `lib/security.ts` (validation) → `packages/backend/app/schemas.py` (Action union) |
| Change what the extractor captures | `packages/browser-extension/lib/page-extractor.ts` |
| Swap the mock LLM | `packages/backend/app/mock_llm.py` |
| Adjust CORS or the backend URL | `packages/backend/app/main.py` (CORS) + `packages/browser-extension/entrypoints/background.ts` (`BACKEND_URL`) |
| Add a manifest permission | `packages/browser-extension/wxt.config.ts` |
| Add a new side-panel hook/component | `entrypoints/sidepanel/hooks/` or `entrypoints/sidepanel/components/` |
