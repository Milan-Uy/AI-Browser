# Plan: Resolve actions by role + accessible-name (with index primary, role+name fallback)

## Context

Section 2 of `LLM-BROWSER-TOOLING.md` recommends resolving actions by ARIA role + computed accessible name. The doc was written assuming actions were still keyed by CSS selectors, but recommendation #1 (integer indices + ephemeral `data-aib-id` attributes) has since shipped (`PLAN-indexed-elements.md`, commit `1e5bc1e`).

So the practical adaptation is **role+name as a robustness fallback for index resolution**, not a replacement for it. Concretely, today the dispatcher fails when the DOM mutates between snapshot and action (e.g., a click in turn N rewrites the DOM and turn N+1's index map is rebuilt, but a *second action in the same turn* targeting an index that just got re-rendered cannot recover). With role+name attached to each action, the dispatcher can re-find the same element by semantics when its index/attribute has been wiped.

**Outcome:** higher action-success rate on dynamic React/SPA sites, particularly within-turn DOM mutations, with no protocol break for older clients (role/name are additive and optional).

**User decisions confirmed:**
- Resolution order: **index → role+name fallback** (index stays primary).
- Accessible-name compute: **add `dom-accessibility-api`** (~10 KB, MIT) to `packages/browser-extension`.

---

## Files to modify

### Browser extension (TypeScript)

1. `packages/browser-extension/package.json` — add `dom-accessibility-api` to `dependencies`.
2. `packages/browser-extension/lib/messaging.ts` — extend `InteractiveElement` and the four index-bearing `LLMAction` variants with optional `role` + `name`.
3. `packages/browser-extension/lib/page-extractor.ts` — compute `role` + `name` per element using `dom-accessibility-api`; emit them.
4. `packages/browser-extension/lib/dom-actions.ts` — add `findByRoleAndName(role, name)` helper; thread the action through `resolveByIndex` so it can fall back to role+name when the index path returns null.
5. `packages/browser-extension/lib/__tests__/page-extractor.test.ts` — new cases for role + accessible-name extraction.
6. `packages/browser-extension/lib/__tests__/dom-actions.test.ts` — new cases for the role+name fallback when the index is stale.

### Backend (Python)

7. `packages/backend/app/schemas.py` — add optional `role: Optional[str]` + `name: Optional[str]` to `InteractiveElement`, `ClickAction`, `FillAction`, `ScrollAction`, `SelectAction`.
8. `packages/backend/app/llm.py` — render `role` + `name` in `_build_system_prompt`; update the `ACTION:` examples to include `role` + `name`.
9. `packages/backend/app/mock_llm.py` — emit `role` + `name` in mock actions so the existing turn-aware login flow still demonstrates the new shape.
10. `packages/backend/tests/test_chat.py` — assert role+name appear in the prompt and survive in the mock-LLM action JSON.

---

## Design

### 1. Extractor changes (`page-extractor.ts`)

- Import `computeAccessibleName` from `dom-accessibility-api`.
- Add a private `getRole(el: HTMLElement): string` helper:
  - If `el.hasAttribute("role")`, return that.
  - Otherwise, return implicit role from a small lookup driven by `tag` + `type`:
    - `a[href]` → `link`
    - `button` → `button`
    - `input[type=text|email|search|tel|url|""]` → `textbox`
    - `input[type=checkbox]` → `checkbox`
    - `input[type=radio]` → `radio`
    - `input[type=submit|button|reset]` → `button`
    - `select` → `combobox`
    - `textarea` → `textbox`
    - else: `""`
  - Rationale: `dom-accessibility-api` does *not* export a role resolver; it only computes names. The implicit-role table is small and the explicit `role=` attribute already covers the long tail. This matches what Playwright's `getByRole` checks.
- Inside `describeElement`, after building the existing `text`, call `computeAccessibleName(el)` and `getRole(el)`. Truncate name to 120 chars. Set `info.role` and `info.name` only if non-empty (keep payload lean).
- Keep the existing `text` field untouched — it remains useful for tags whose accessible name doesn't capture content (e.g., a `<a>` whose visible text differs from a label-derived name).

### 2. Type changes (`messaging.ts`)

```ts
export interface InteractiveElement {
  index: number;
  tag: string;
  text: string;
  type?: string;
  placeholder?: string;
  value?: string;
  role?: string;   // NEW
  name?: string;   // NEW (computed accessible name)
}

export type LLMAction =
  | { kind: "click"; index: number; role?: string; name?: string; description?: string }
  | { kind: "fill"; index: number; value: string; role?: string; name?: string; description?: string }
  | { kind: "scroll"; index?: number; direction?: ...; amount?: number; role?: string; name?: string; description?: string }
  | { kind: "navigate"; url: string; description?: string }
  | { kind: "select"; index: number; value: string; role?: string; name?: string; description?: string };
```

`navigate` does not need role/name — it doesn't target an element.

### 3. Dispatcher changes (`dom-actions.ts`)

Refactor `resolveByIndex(index, timeoutMs)` into `resolveTarget(action, timeoutMs)` (rename to express the new contract) **or** keep `resolveByIndex` and add a sibling `resolveByRoleAndName`. Recommended path (smaller diff, easier tests): keep `resolveByIndex` for the existing fast path and add a `resolveTarget` wrapper that calls `resolveByIndex` and falls back to `findByRoleAndName` when the action carries role+name.

```ts
async function resolveTarget(
  action: { index?: number; role?: string; name?: string },
  timeoutMs = 1500,
): Promise<HTMLElement | null> {
  if (action.index !== undefined) {
    const byIndex = await resolveByIndex(action.index, timeoutMs);
    if (byIndex) return byIndex;
  }
  if (action.role && action.name) {
    return findByRoleAndName(action.role, action.name);
  }
  return null;
}

function findByRoleAndName(role: string, name: string): HTMLElement | null {
  const candidates = document.querySelectorAll<HTMLElement>(INTERACTIVE_SELECTOR);
  for (const el of candidates) {
    if (getRole(el) !== role) continue;
    if (computeAccessibleName(el).trim() === name.trim()) return el;
  }
  return null;
}
```

- Export `INTERACTIVE_SELECTOR` and `getRole` from `page-extractor.ts` (or move both into a new `lib/a11y.ts` and import from both modules — cleaner separation, recommended).
- Update `doClick` / `doFill` / `doSelect` / `doScroll` to call `resolveTarget(action)` instead of `resolveByIndex(action.index)`. Update the failure message to mention both fallback paths exhausted (e.g., `"element not found: index=3 role=button name='Sign in' (likely stale; will re-snapshot next turn)"`).
- The MutationObserver wait inside `resolveByIndex` stays — for the index path. `findByRoleAndName` runs synchronously after the index path times out. If that's too long, consider shrinking `timeoutMs` to 750ms when role+name are available (the role+name fallback is cheap and instant); leave it at 1500ms otherwise. Keep this as a follow-up tuning knob, not part of v1.

### 4. Backend prompt changes (`llm.py`)

Update `_build_system_prompt` so the element list renders role + name when present. Suggested format keeps existing tag-based rendering and appends role/name as attributes:

```
Interactive elements (use the [index], role, and name in your action):
  [0]<input type="email" placeholder="Email" role="textbox" name="Email" />
  [1]<input type="password" placeholder="Password" role="textbox" name="Password" />
  [2]<button role="button" name="Log In">Log In</button>
```

Update the ACTION examples in the prompt to include role+name fields:

```
ACTION: {"kind": "click", "index": 3, "role": "button", "name": "Sign in", "description": "sign in button"}
ACTION: {"kind": "fill", "index": 1, "value": "user@example.com", "role": "textbox", "name": "Email", "description": "email field"}
```

Add one short instruction line: *"Always include role and name from the element list in your actions — they are used as a fallback when the index becomes stale."*

### 5. Mock-LLM update (`mock_llm.py`)

The existing 3-turn login mock locates fields by inspecting `page.elements`. When emitting the action JSON, copy through the element's `role` and `name` (read from the `InteractiveElement`). This proves the round-trip works without depending on a real LLM.

---

## Reused functions / patterns

- `dom-accessibility-api`'s `computeAccessibleName(el)` — does the heavy lifting (W3C algorithm: aria-labelledby > aria-label > native HTML label > placeholder > innerText > title).
- Existing `INTERACTIVE_SELECTOR` constant in `page-extractor.ts` — reuse in `findByRoleAndName` so the extractor and dispatcher search the same element set.
- Existing `resolveByIndex` retry-via-MutationObserver pattern stays — only its wrapper (`resolveTarget`) is new.
- Existing `_parse_model_line` in `llm.py` already json-loads the full action object; new fields will pass through automatically as long as the Pydantic schema accepts them.
- Existing `describeElement` checkbox label-fallback can stay (still useful for `text`), but we now have a stronger general path via `computeAccessibleName` — leave both for one release, then revisit removing the bespoke label fallback once the a11y compute is proven stable in production traffic.

---

## Edge cases & open questions

- **happy-dom + dom-accessibility-api**: the lib uses standard DOM APIs (getAttribute, querySelector, getComputedStyle, labels). happy-dom supports all of these. Verify in test setup with one concrete case (button with `aria-labelledby`) before committing the dependency.
- **Multiple matches**: `findByRoleAndName` returns the first match. In practice, role+name is unique enough that this rarely conflicts; if it does, the action is ambiguous and the LLM has bigger problems. Document this in a code comment.
- **Empty accessible name** (e.g., icon-only button): `computeAccessibleName` returns `""`. Skip emitting `name` in `InteractiveElement` (only set if non-empty); the dispatcher's role+name fallback simply won't fire — index is the only path. Same as today.
- **`description` vs. `name`**: keep both. `description` is the LLM's free-text label (used for logs/UI); `name` is the *computed* accessible name (used for resolution). They serve different roles.
- **Token budget**: adding `role` + `name` adds ~30–60 tokens per element × ~50 typical elements ≈ 1.5–3k tokens per turn. Acceptable; still well under the indexed-elements savings vs. selectors.

---

## Verification

1. **Type check & lint**
   - `pnpm --filter browser-extension compile`
   - Backend: `cd packages/backend && python -m mypy app` (if configured) or just run pytest.

2. **Unit tests (browser extension)**
   - `pnpm --filter browser-extension test` — must pass existing 45+ cases plus new ones.
   - New cases in `page-extractor.test.ts`:
     - Button with `aria-label="Save"` → `role==="button"`, `name==="Save"`.
     - Link `<a href="/x">Home</a>` → `role==="link"`, `name==="Home"`.
     - Input with associated `<label for>` → `role==="textbox"`, `name` from label.
     - Element with explicit `role="menuitem"` → `role==="menuitem"`, name from `aria-label`/text.
     - Icon-only button (no label) → no `name` field emitted.
   - New cases in `dom-actions.test.ts`:
     - Click action with role+name where the indexed element was *removed* and re-added under a different `data-aib-id`: `findByRoleAndName` recovers it and the click succeeds.
     - Click action with role+name where no element matches: returns `ok: false` with a message that mentions both `index=` and `role=` were tried.
     - Click action with no role+name on the action: behavior identical to today (index path only).

3. **Backend tests**
   - `cd packages/backend && pytest` — must pass existing tests plus:
     - `test_chat.py`: assert that the prompt rendered for a page containing `[role="button"]` includes `role="button"` and `name="..."`.
     - The mock-LLM 3-turn login flow now emits `role` and `name` fields and the backend round-trips them in `TurnRecord.actions`.

4. **End-to-end smoke**
   - `pnpm ext:dev` to start the WXT dev server.
   - Load the unpacked build in `chrome://extensions` (developer mode).
   - Run the backend with `AIB_LLM_BACKEND=mock pnpm backend:dev`.
   - On a page like `https://www.saucedemo.com/`, send "log in as standard_user / secret_sauce". Observe network logs (`AIB_LOG_LEVEL=DEBUG AIB_LOG_LLM_FULL=1`) confirming the prompt contains `role=` and `name=` for each interactive element, and that `ACTION:` JSON emitted by the LLM includes role+name.
   - Manual stale-index repro: open DevTools and after the snapshot is taken, manually `document.querySelector('[data-aib-id="1"]').removeAttribute('data-aib-id')` then trigger the action. With this change, the click should still succeed via the role+name fallback. Without this change (revert on a branch to compare), it would fail.

5. **Backwards compatibility**
   - Old client builds emitting actions without `role`/`name`: backend Pydantic models accept (fields are `Optional`). Dispatcher's `resolveTarget` falls back to index-only path. No behavior change.
   - New client + old backend: backend ignores extra fields by default in Pydantic v2 (verify `model_config`). If `extra='forbid'` is set anywhere, change to `extra='ignore'` for forward-compat.

---

## Out of scope

- `chrome.debugger`-based action dispatch (recommendation #3 in the doc).
- Defuddle-based page-text extraction (recommendation #4).
- Persistent cross-turn element identity (already noted as a follow-up in `PLAN-indexed-elements.md`).
- Vision/SoM screenshot pipeline.

These are tracked separately and don't block this change.
