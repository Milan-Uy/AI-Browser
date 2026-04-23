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
| `AIB_LLM_BACKEND` | `mock` | LLM to use: `mock` or `gemini` |
| `GEMINI_API_KEY` | — | Required when `AIB_LLM_BACKEND=gemini` |
| `AIB_LOG_LEVEL` | `INFO` | Python log level (`DEBUG`, `INFO`, `WARNING`, `ERROR`) |
| `AIB_LOG_LLM_FULL` | — | Set to `1` to log full page text and history |
| `AIB_ALLOW_ORIGINS` | — | Extra CORS origins (comma-separated); `chrome-extension://*` is always allowed |

## Running with a real LLM

1. Set `AIB_LLM_BACKEND=gemini` and `GEMINI_API_KEY=your-key` in `packages/backend/.env`.
2. Implement `GeminiLLM.stream()` in `packages/backend/app/llm.py` (the stub raises `NotImplementedError` and marks the integration point).
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
