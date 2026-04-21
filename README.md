# AI Browser Agent

Chrome extension that pairs an LLM chat side panel with DOM read/write on the current tab.

## Quick start
- `pnpm install`
- `pnpm ext:dev` → starts the WXT dev server (no browser launches). In your own Chrome, open `chrome://extensions`, enable Developer mode, click *Load unpacked*, and select `packages/browser-extension/.output/chrome-mv3-dev`. After that, HMR reloads the extension on file changes — leave it loaded between sessions.
- `pnpm backend:dev` → FastAPI mock on :8000

See `AI-Browser.md` for architecture.
