# AI Browser Agent Chrome Extension — Architecture Plan

## Context

Build a Chrome extension with an AI chat side panel that can both converse generally AND read/control the current webpage. The LLM acts as a full browser agent — clicking, filling forms, scrolling, navigating — with human confirmation before each action. FastAPI backend mocks the LLM for now; will swap in a self-hosted model later.

---

## Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Extension framework | **WXT** | File-based entrypoints, auto-generates manifest, HMR for all contexts, active maintenance, first-class React support |
| UI | **React + Tailwind** | Matches your existing skills |
| Backend | **FastAPI** (existing) | Add SSE streaming endpoint for chat |
| Messaging | **chrome.runtime typed messages** | Type-safe discriminated union protocol |
| Build | **pnpm monorepo** | Keep extension separate from any other projects |

---

## Architecture — Data Flow

```
Side Panel (React)  ←── chrome.runtime ──→  Background SW (Orchestrator)
                                                    │
                                         chrome.tabs.sendMessage
                                                    │
                                            Content Script (per-tab)
                                            - Reads DOM / extracts page
                                            - Executes click/fill/scroll

Background SW  ←── fetch + SSE ──→  FastAPI Backend
                                     POST /chat (streaming)
                                     Mock LLM → Real LLM later
```

**Action flow:** LLM emits action → Background sends `CONFIRM_ACTION` to side panel → User approves → Background sends `EXECUTE_ACTION` to content script → Result fed back to LLM.

---

## Folder Structure

```
packages/browser-extension/
├── wxt.config.ts
├── entrypoints/
│   ├── sidepanel/            # React side panel app
│   │   ├── index.html
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── components/
│   │   │   ├── ChatPanel.tsx
│   │   │   ├── MessageBubble.tsx
│   │   │   ├── ActionConfirmDialog.tsx
│   │   │   └── PageContextBadge.tsx
│   │   └── hooks/
│   │       ├── useChat.ts
│   │       ├── usePageContent.ts
│   │       └── useStreaming.ts
│   ├── background.ts         # Service worker orchestrator
│   └── content.ts            # DOM reader + actuator
├── lib/
│   ├── messaging.ts          # Typed message protocol (discriminated union)
│   ├── api-client.ts         # FastAPI SSE client
│   ├── dom-actions.ts        # click, fill, scroll, navigate executors
│   └── page-extractor.ts     # Extracts text + interactive elements from page
└── public/icons/
```

---

## Key Design Decisions

### No External Automation Tools — Native DOM APIs Only

We do NOT use Puppeteer, Playwright, or Selenium. Those tools launch a **separate** browser process from outside. Since our code runs **inside** the browser as a Chrome extension, the content script already has full DOM access. The content script IS the automation layer.

**Page content extraction** (in `lib/page-extractor.ts`, runs in content script):

| What | API | Notes |
|------|-----|-------|
| Page text | `document.body.innerText` | Truncate to ~8K chars |
| Page title | `document.title` | |
| Page URL | `window.location.href` | |
| Selected text | `window.getSelection().toString()` | Optional — what user highlighted |
| Interactive elements | `document.querySelectorAll('a, button, input, select, textarea, [role="button"]')` | Cap at 200 elements, return tag/text/selector/type |

**Browser actions** (in `lib/dom-actions.ts`, runs in content script):

| Action | API | Notes |
|--------|-----|-------|
| Click | `element.click()` + synthetic `MouseEvent` | Synthetic event needed for React-managed DOM |
| Fill form | `element.value = '...'` + dispatch `InputEvent` + `ChangeEvent` | Must dispatch events so React/Angular detect the change |
| Scroll | `window.scrollBy()` or `element.scrollIntoView()` | |
| Navigate | `window.location.href = url` | Validated against URL scheme allowlist first |
| Select dropdown | `element.value = '...'` + dispatch `ChangeEvent` | |

**How the LLM drives actions:** The LLM receives the list of interactive elements (tag, text, unique CSS selector) and responds with which action to take + which selector to target. The content script executes via `document.querySelector(selector)` → action.

### Typed Message Protocol (`lib/messaging.ts`)

All chrome.runtime messages use a discriminated union — `GET_PAGE_CONTENT`, `EXECUTE_ACTION`, `CHAT_MESSAGE`, `STREAM_CHUNK`, `CONFIRM_ACTION`, `ACTION_APPROVED`, etc. This keeps the three contexts (side panel, background, content script) type-safe.

### Page Extraction Strategy

- **Text content**: `document.body.innerText` truncated to ~8K chars + title + URL
- **Interactive elements**: Query `a, button, input, select, textarea, [role="button"]` — return tag, text, unique selector, type, placeholder (capped at 200 elements)
- **Never extract** `input[type="password"]` values

### LLM Response Format (from FastAPI)

SSE stream with two chunk types:

```jsonc
{ "type": "text", "content": "I see a login form..." }
{ "type": "action", "action": { "kind": "click", "selector": "#submit-btn" } }
```

Background SW parses these: text → forward to side panel, action → send confirmation request.

### Streaming via POST + ReadableStream

Use `fetch` + `response.body.getReader()` (not `EventSource`) since we need POST with a JSON body.

---

## Security (Non-negotiable)

1. **Human-in-the-loop**: `ActionConfirmDialog` must appear before EVERY DOM action — no auto-execute
2. **URL scheme allowlist**: Navigation restricted to `https://` only (no `javascript:`, `data:`, `file:`, `chrome://`)
3. **Selector deny-list**: Block selectors targeting extension internals or cross-origin iframes
4. **No password extraction**: Strip `input[type="password"]` from interactive elements
5. **Rate limit actions**: Minimum 500ms cooldown between DOM actions
6. **CORS**: FastAPI allows only `chrome-extension://<id>` origin
7. **No eval/innerHTML** with LLM output — use `querySelector` and `.value`/`.textContent` setters

---

## Implementation Phases

### Phase 1 — Skeleton

- `pnpm dlx wxt@latest init` with React template
- Configure `wxt.config.ts` (side panel permissions, React module)
- Create three entrypoints (sidepanel, background, content)
- Verify extension loads in Chrome

### Phase 2 — Chat UI

- Build ChatPanel, MessageBubble with Tailwind
- Wire `useChat` hook with hardcoded responses (no backend)
- Implement chrome.runtime messaging between side panel ↔ background

### Phase 3 — Page Content Extraction

- Implement `page-extractor.ts` in content script
- Wire GET_PAGE_CONTENT message flow end-to-end
- Show page context badge in UI

### Phase 4 — FastAPI Integration

- Add `POST /chat` SSE streaming endpoint to FastAPI
- Mock LLM responder with text + action chunks
- Wire background SW → FastAPI → streaming to side panel

### Phase 5 — Browser Automation

- Implement `dom-actions.ts` (click, fill, scroll, navigate)
- Build `ActionConfirmDialog` confirmation UI
- Wire full action loop: LLM action → confirm → execute → result back to LLM
- Extract interactive elements for LLM context

### Phase 6 — Polish & Security

- All security validations from the list above
- Error handling, retry logic, loading states

---

## Verification

1. Load extension in `chrome://extensions` (developer mode) — side panel opens
2. Type a message — streaming mock response appears token-by-token
3. Toggle "include page context" — verify page text appears in backend request
4. Mock LLM returns an action — confirm dialog appears, click Allow, action executes on page
5. Deny an action — verify it does NOT execute
6. Test on a real page (e.g. Google search) — page content extraction works, interactive elements listed

