# AI Browser Agent

Chrome extension that pairs an LLM chat side panel with DOM read/write on the current tab. Supports multi-step tasks like logging in — the agent loops up to 10 turns, re-reading the page after each action, until the task is complete.

## Quick start

```bash
pnpm install
pnpm backend:dev   # FastAPI server on :8000 (see Backend setup first)
pnpm ext:dev       # WXT dev server with HMR
```

To load the extension in Chrome: open `chrome://extensions`, enable Developer mode, click **Load unpacked**, and select the path WXT prints (typically `packages/browser-extension/.output/chrome-mv3`). HMR reloads the extension on file changes — leave it loaded between sessions.

## Backend setup

The backend is a Python package; it isn't installed by `pnpm install`. Do this once (requires Python 3.11+):

```bash
# macOS / Linux
cd packages/backend
python -m venv .venv
source .venv/bin/activate
pip install -e .
```

```powershell
# Windows (PowerShell)
cd packages\backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -e .
```

In future sessions re-activate the venv before running `pnpm backend:dev`.

## Environment variables

Copy the example file and edit it before starting the server:

```bash
cp packages/backend/.env.example packages/backend/.env
```

Then load it when starting the dev server:

```bash
# macOS / Linux
set -a && source packages/backend/.env && set +a
pnpm backend:dev
```

```powershell
# Windows (PowerShell)
Get-Content packages\backend\.env | ForEach-Object {
  if ($_ -match '^\s*([^#][^=]*)=(.*)$') { [System.Environment]::SetEnvironmentVariable($Matches[1].Trim(), $Matches[2].Trim()) }
}
pnpm backend:dev
```

Key variables (see `.env.example` for the full list):

| Variable | Default | Purpose |
|----------|---------|---------|
| `AIB_LLM_BACKEND` | `mock` | LLM to use: `mock`, `gemini`, or `custom` |
| `GEMINI_API_KEY` | — | Required when `AIB_LLM_BACKEND=gemini` |
| `AIB_CUSTOM_API_URL` | — | Required when `AIB_LLM_BACKEND=custom` (host, no trailing slash) |
| `AIB_CUSTOM_API_KEY` | — | Required when `AIB_LLM_BACKEND=custom` (bearer token) |
| `AIB_CUSTOM_MODEL` | — | Optional model name forwarded to the custom backend |
| `AIB_CUSTOM_ENDPOINT_PATH` | `/openapi/chat/v1/messages` | Override if your provider uses a different path |
| `AIB_LOG_LEVEL` | `INFO` | Python log level (`DEBUG`, `INFO`, `WARNING`, `ERROR`) |
| `AIB_LOG_LLM_FULL` | — | Set to `1` to log full page text and history |
| `AIB_ALLOW_ORIGINS` | — | Extra CORS origins (comma-separated); `chrome-extension://*` is always allowed |

## Running with a real LLM

### Gemini

1. Set `AIB_LLM_BACKEND=gemini` and `GEMINI_API_KEY=your-key` in `packages/backend/.env`.
2. Restart the backend.

### Custom proprietary LLM

1. Set `AIB_LLM_BACKEND=custom`, `AIB_CUSTOM_API_URL`, and `AIB_CUSTOM_API_KEY` in `packages/backend/.env`.
2. The default `CustomLLM.stream()` in `packages/backend/app/llm.py` assumes an OpenAI-style streaming API (`POST {url}/openapi/chat/v1/messages` with bearer auth, SSE response of `data: {"choices":[{"delta":{"content":"..."}}]}`). If your provider uses a different request body or chunk format, edit the two blocks marked `ADAPT` in `app/llm.py` (`CustomLLM.stream` body and `_extract_custom_chunk_text`).
3. Restart the backend.

## Running tests

```bash
pnpm ext:test                        # Extension (Vitest)
cd packages/backend && pytest -v     # Backend (pytest)
```

## Further reading

- `CLAUDE.md` — commands, architecture, message protocol, agent loop
- `STRUCTURE.md` — file-by-file tour of the repo
- `AI-Browser.md` — architecture plan, data-flow diagram, security policies
