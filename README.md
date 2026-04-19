# AI Browser Agent

Chrome extension that pairs an LLM chat side panel with DOM read/write on the current tab.

## Quick start
- `pnpm install`
- `pnpm ext:dev` → loads WXT dev server, then load `packages/browser-extension/.output/chrome-mv3-dev` in chrome://extensions
- `pnpm backend:dev` → FastAPI mock on :8000

See `AI-Browser.md` for architecture.
