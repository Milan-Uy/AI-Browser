# Plan: Adopt indexed elements instead of CSS selectors

## Context

Today the extension extracts interactive elements as `{ selector: string, tag, text, type?, placeholder?, value? }`, the backend renders them into LLM prompts as `selector='#email', tag='input', ...`, the LLM emits `ACTION: {"kind":"click","selector":"#submit"}`, and the content script resolves via `document.querySelector(selector)` with four semantic-fallback strategies (aria-label / innerText / value-attr / wrapping-label, with `₱→P` normalization) for when selectors drift.

`LLM-BROWSER-TOOLING.md §1` recommends switching to short integer indices (browser-use convention): the LLM emits `{"kind":"click","index":3}`, and the extension resolves `3` against an in-memory `Map<number, Element>` rebuilt every snapshot, with a `data-aib-id="N"` ephemeral DOM attribute as a re-render-survival fallback. Wins: fewer tokens, no string-escaping bugs, fewer LLM hallucination failure modes, deterministic resolution. The semantic-fallback layer becomes obsolete because the LLM never authors a string the DOM has to match — it just echoes an integer.

User decisions (locked):
1. Remove all selector-based semantic fallbacks (aria-label / text / value / label / `₱→P`) — index resolution is deterministic.
2. Resolution layer = `Map<number, Element>` first, then `[data-aib-id="N"]` query, then a 1500 ms `MutationObserver` wait for the attribute to appear.
3. Clear `data-aib-id` once at the top of each `extractPageContent()` (single sweep), NOT after each action — the Map handles within-turn follow-up actions, and a stale attribute can still recover a re-mounted node.
4. Land in one batch on `claude/indexed-elements-selectors-ERupY`. No transitional shim.

Scope is explicitly **just** §1. §2 (role + accessible-name dispatch) and §3 (chrome.debugger) are not part of this plan.

## Changes

### Extension — `packages/browser-extension/`

**`lib/messaging.ts`** — type surface
- `InteractiveElement.selector: string` → `index: number`.
- `LLMAction` variants:
  - `click`, `fill`, `select`: `selector: string` → `index: number`.
  - `scroll`: `selector?: string` → `index?: number`.
  - `navigate`: unchanged.

**`lib/page-extractor.ts`** — extractor
- Delete `buildUniqueSelector()` and `escapeCSSAttrValue()`.
- Add module-level `let elementIndex = new Map<number, HTMLElement>()` and `export function getIndexedElement(i: number): HTMLElement | null`.
- `extractPageContent()`:
  1. Sweep stale attributes once: `document.querySelectorAll('[data-aib-id]').forEach(e => e.removeAttribute('data-aib-id'))`. Clear `elementIndex`.
  2. Iterate `INTERACTIVE_SELECTOR` nodes (same 200 cap, still skip `type="password"`).
  3. For each kept element: assign `index = elements.length` (its position in the output array), call `el.setAttribute("data-aib-id", String(index))`, `elementIndex.set(index, el)`, push `{ index, tag, text, ... }`.
- `describeElement()` no longer builds a selector — drops to ~25 lines; checkbox/radio label-text + value handling stays unchanged.

**`lib/dom-actions.ts`** — dispatcher
- Replace `waitForElement(selector, timeoutMs)` with:
  ```ts
  async function resolveByIndex(index: number, timeoutMs = 1500): Promise<HTMLElement | null>
  ```
  Resolution order:
  1. `getIndexedElement(index)` → if non-null and `el.isConnected` → return.
  2. `document.querySelector<HTMLElement>('[data-aib-id="' + index + '"]')` → if found → return.
  3. `MutationObserver` watching `document.documentElement` (`childList`, `subtree`, `attributes`, `attributeFilter: ['data-aib-id']`) for attribute to appear; resolve `null` on `timeoutMs` timeout.
- Delete `findBySemanticFallback`, `normalizePriceText`, `getLabelText`.
- All `do*` helpers take `index: number` (or `number | undefined` for `doScroll`):
  - `doClick(index)`, `doFill(index, value)`, `doSelect(index, value)`, `doScroll(action)` (uses `action.index` when present, else direction/amount as today), `doNavigate(url)` unchanged.
- Failure messages: `` `element not found: index=${index} (likely stale; will re-snapshot next turn)` `` so the LLM has signal in history.
- Do not clear `data-aib-id` after each action — the per-extraction sweep handles it.

**`lib/security.ts`** — validation
- Drop `FORBIDDEN_SELECTOR_PATTERNS` and the click/fill/select/scroll branch in `validateAction` (becomes `{ ok: true }`). Keep `validateAction` exported (call site in `background.ts` stays). Keep navigate URL validation, `createRateLimiter`, `isNoopNavigation` untouched.

**`entrypoints/content.ts`** — no structural change. Still calls `extractPageContent()` and `executeAction(action)`; both now operate on indices.

**`entrypoints/background.ts`** — no logic change. `describeAction()` already only references `action.value` / `action.url` / `action.direction` — never `selector` — so it works as-is.

**`lib/api-client.ts`** — no change (passes chunks through verbatim).

### Backend — `packages/backend/`

**`app/schemas.py`**
- `InteractiveElement.selector: str` → `index: int`.
- `ClickAction.selector: str` → `index: int`. Same for `FillAction`, `SelectAction`.
- `ScrollAction.selector: Optional[str]` → `index: Optional[int]`.
- `NavigateAction` unchanged.

**`app/llm.py`** — `_build_system_prompt`
- Update instruction text and example ACTION lines:
  - `ACTION: {"kind": "click", "index": 3, "description": "sign in button"}`
  - `ACTION: {"kind": "fill", "index": 1, "value": "user@example.com", "description": "email field"}`
  - `ACTION: {"kind": "select", "index": 7, "value": "option1", "description": "dropdown"}`
  - navigate / scroll examples unchanged in shape.
- Replace the elements-section rendering loop with browser-use format:
  ```
  Interactive elements (use the [index] in your action):
    [0]<input type="email" placeholder="Email" />
    [1]<input type="password" placeholder="Password" />
    [2]<button>Log In</button>
  ```
  Render attrs that exist (`type`, `placeholder`, `value`) inside the open tag; render `text` between tags for `button`/`a`/role-button; close tag for non-void elements.
- `_parse_model_line` and `_build_gauss_contents` need no logic change — they JSON-(de)serialize whatever schema the action models declare.

**`app/mock_llm.py`**
- `_find_email_field` / `_find_password_field` / `_find_submit_button` return `int` (the position in `elements[]`) or `None`.
- Action JSON in `mock_stream` emits `"index": N` instead of `"selector": ...` for fill/click. All other text identical.

### Tests

**`packages/browser-extension/lib/__tests__/page-extractor.test.ts`**
- Delete the import of `buildUniqueSelector` and the 8 `buildUniqueSelector*` tests (lines 50–101, 159–166).
- Keep title/url/text, password-skip, 200-cap, value-attribute (checkbox/radio), label-text-fallback tests — assertions update to use `index` and `e.tag`/`e.value`/`e.text` (no selector).
- Add: indices are sequential starting at 0; each kept element has matching `data-aib-id`; a second `extractPageContent()` call clears stale `data-aib-id` attributes.

**`packages/browser-extension/lib/__tests__/dom-actions.test.ts`**
- Replace `waitForElement` import with `resolveByIndex`.
- Rewrite the click/fill/select/missing/late tests to set up the page, call `extractPageContent()` (or directly populate the Map via a test helper), then call `executeAction({ kind, index, ... })`.
- Delete the entire `findBySemanticFallback — value and label strategies` block and the aria-label / innerText fallback tests (lines 60–127).
- Add: `resolveByIndex` returns the element via the Map; if Map is cleared but the `data-aib-id` attribute remains, re-query path works; returns `null` after timeout if both miss.

**`packages/browser-extension/lib/__tests__/security.test.ts`**
- Delete the two selector-blocking tests (lines 29–37). Keep navigate-URL tests, rate-limiter, `isNoopNavigation`.

**`packages/browser-extension/lib/__tests__/messaging.test.ts`**
- If any constructed `LLMAction` literal uses `selector`, switch to `index`. Otherwise unchanged.

**`packages/backend/tests/test_chat.py`**
- `LOGIN_PAGE.elements`: replace each `"selector": "#x"` with `"index": 0|1|2`.
- All assertions of the form `actions[0]["selector"] == "#email"` → `actions[0]["index"] == 0` (etc.).
- **Critical:** the embedded raw SSE strings in the Gauss tests hardcode action JSONs:
  - line ~144 (`test_gauss_backend_streams_action_and_done`): `\"selector\": \"#email\"` → `\"index\": 0`.
  - lines ~187–189 (`test_gauss_backend_buffers_action_split_across_chunks`): the chunk-split content rebuilding to `{"kind":"click","selector":"#go"}` → `{"kind":"click","index":0}`. Re-split byte boundaries to keep the "split across chunks" intent.
  - line ~210 same test's final assertion.
  - line ~257 (`test_gauss_backend_multi_turn_contents`): expected model turn string switches to `"index": 0`.
- The `assert actions[0]["action"] == { ... }` literals must mirror the new shape.

## Critical files

- `packages/browser-extension/lib/messaging.ts`
- `packages/browser-extension/lib/page-extractor.ts`
- `packages/browser-extension/lib/dom-actions.ts`
- `packages/browser-extension/lib/security.ts`
- `packages/browser-extension/lib/__tests__/page-extractor.test.ts`
- `packages/browser-extension/lib/__tests__/dom-actions.test.ts`
- `packages/browser-extension/lib/__tests__/security.test.ts`
- `packages/backend/app/schemas.py`
- `packages/backend/app/llm.py`
- `packages/backend/app/mock_llm.py`
- `packages/backend/tests/test_chat.py`

## Known limitations carried forward (not addressed here)

- **Within-turn DOM mutation:** if action 1 in a turn opens a dropdown that re-renders the page, action 2 in the same SSE stream may target a stale index. Behavior: `resolveByIndex` returns null, action returns `{ ok: false, message: "...stale..." }`, next turn re-snapshots. Same brittleness exists in the selector code today.
- **Shadow DOM / cross-origin iframes:** `INTERACTIVE_SELECTOR` doesn't pierce them. Same as today; `[data-aib-id]` recovery doesn't help here either.
- **Hostile pages with `[data-*]` attribute selectors in their CSS:** setting 200 attributes triggers a small style recalc. Negligible at the 200 cap.

## Verification

1. Type-check + unit tests:
   ```
   pnpm --filter browser-extension compile
   pnpm ext:test
   pnpm --filter browser-extension exec vitest run lib/__tests__/page-extractor.test.ts
   pnpm --filter browser-extension exec vitest run lib/__tests__/dom-actions.test.ts
   pnpm --filter browser-extension exec vitest run lib/__tests__/security.test.ts
   ```
   ```
   cd packages/backend && pytest tests/test_chat.py -v
   ```

2. Build the extension and load it in `chrome://extensions` → developer mode → Load unpacked → `packages/browser-extension/.output/chrome-mv3/`:
   ```
   pnpm ext:build
   ```

3. End-to-end with the mock backend (`AIB_LLM_BACKEND=mock`, default):
   ```
   pnpm backend:dev
   ```
   On any login form (e.g. https://www.saucedemo.com/), open the side panel and type `login`. Verify three turns: fill email → fill password → click submit. Inspect DevTools to confirm:
   - `[data-aib-id]` attributes are present on interactive elements after each `GET_PAGE_CONTENT` and absent on next snapshot.
   - Background console logs `[fill ✓]`, `[click ✓]` action results.

4. Backend prompt sanity check with `AIB_LOG_LEVEL=DEBUG AIB_LOG_LLM_FULL=1 pnpm backend:dev`: verify a `llm_request` log line shows the new `[N]<tag>...</tag>` format and the action that comes back uses `"index": N`.

5. Optional: with `AIB_LLM_BACKEND=gemini` and a real key, run a single-turn task on a real page and confirm the model emits index-form ACTIONs given the new prompt format.
