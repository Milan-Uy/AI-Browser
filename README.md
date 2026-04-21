# AI Browser Agent

Chrome extension that pairs an LLM chat side panel with DOM read/write on the current tab.

## Quick start
- `pnpm install`
- `pnpm ext:dev` → starts the WXT dev server (no browser launches). In your own Chrome, open `chrome://extensions`, enable Developer mode, click *Load unpacked*, and select the path WXT prints (typically `packages/browser-extension/.output/chrome-mv3`). After that, HMR reloads the extension on file changes — leave it loaded between sessions.
- `pnpm backend:dev` → FastAPI mock on :8000 (see *Backend setup* first)

## Backend setup

The backend is a Python package and isn't installed by `pnpm install`. Do this once (requires Python 3.11+):

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

In future sessions, re-activate the venv (`source .venv/bin/activate` / `.venv\Scripts\Activate.ps1`) before running `pnpm backend:dev`.

See `AI-Browser.md` for architecture.
