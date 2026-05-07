# LLM-Browser Tooling Research (May 2026)

Context recap: Chrome MV3 extension, React + TS side panel + WXT background SW + content script. Backend is FastAPI calling Gemini / Gauss / agentsec. Today the content script does its own DOM extraction (visible text + array of `{selector, tag, text, type, placeholder}`) and its own action dispatcher (click/type/select/navigate via CSS selectors). Goal: figure out what off-the-shelf libraries would meaningfully improve over the hand-rolled extractor — restricted to things that actually work in an MV3 content script (not Playwright-driven external Chromium).

## TL;DR

The browser-agent ecosystem has bifurcated into two camps:

1. **External-driver agents** (browser-use, Stagehand, Skyvern, LaVague, Playwright-MCP) — control a separate Chromium via Playwright/Puppeteer/CDP-over-WebSocket. None of these drop into an MV3 content script. Borrow their *patterns* (numbered indices, accessibility tree, validate-then-execute), not their code.
2. **In-extension agents** (Nanobrowser, mcp-chrome) — actually live in MV3 and are directly relevant. Both lean heavily on `chrome.debugger` (CDP-from-extension) for robust action dispatch.

The dominant DOM-serialization pattern is now "indexed accessibility-tree-derived element list" (from browser-use, copied by Nanobrowser, Stagehand v3, Playwright-MCP). Indexes are short integers the LLM emits in `click(5)` style — much more token-efficient and robust than CSS selectors.

The current extractor in this repo (visible text + interactive elements with CSS selectors) is conceptually close to this pattern but missing two key wins:

- **Numbered indices** instead of selectors (cheaper tokens, no XPath/CSS escaping bugs, LLM has fewer hallucination failure modes).
- **Accessibility-derived element list** (catches ARIA-only widgets, ignores invisible/aria-hidden noise, gives roles + accessible names that LLMs ground on better).

---

## 1. Page-to-LLM serializers

### browser-use (Python)
- **What:** Reference implementation of the indexed-element pattern for browser agents. Renders page state as `[5]<button>Sign in</button>` lines plus a screenshot, with bounding boxes drawn around each indexed element.
- **MV3:** No. Pure Python, requires Playwright/Patchright; no JS port. ~80k stars.
- **License / latest:** MIT. v0.12.6, April 2 2026.
- **Verdict:** Don't use the library, but **copy the prompt format and the `buildDomTree.js` traversal**. That JS file is the actual injected worker that builds their indexed list — readable and portable into an MV3 content script with minor edits.
- **Link:** https://github.com/browser-use/browser-use

### Stagehand (Browserbase)
- **What:** TS SDK exposing `act()`, `observe()`, `extract()` over Playwright/Puppeteer/CDP. v3 (May 2026) drops the Playwright dependency for a modular "driver" system over CDP. Strong story for `extract()` returning Zod-validated structured data.
- **MV3:** No. Architected for Node + browser driver; v3's CDP engine still talks to a separately-launched Chromium, not into the host page.
- **License / latest:** MIT. v3.6.5, May 6 2026.
- **Verdict:** Not droppable, but the **Zod-schema `extract()` shape** is worth mirroring for any data-pull side-flow you add later. Their `observe()` → `act()` separation (LLM nominates element first, then second pass confirms the action) is a good robustness pattern.
- **Link:** https://github.com/browserbase/stagehand

### Playwright accessibility tree / `chrome.debugger` Accessibility.getFullAXTree
- **What:** AX tree gives `{role, name, value, children}` per node, filtered to what assistive tech sees. The MV3-equivalent is calling `Accessibility.getFullAXTree` over `chrome.debugger`; the `chrome.automation` API technically exists but requires a command-line allowlist flag and is unusable for shipped extensions.
- **MV3:** Partial — only via `chrome.debugger.attach`, which triggers the persistent "started debugging this browser" yellow banner that can't be suppressed.
- **License / latest:** Built-in Chrome API.
- **Verdict:** Higher quality element list than DOM walking (handles ARIA-only widgets, skips decorative content), but the debugger-attach UX cost is real. Worth using only if you also want CDP for `Input.dispatchMouseEvent` / `Input.insertText`.
- **Link:** https://chromedevtools.github.io/devtools-protocol/tot/Accessibility/

### Set-of-Mark (SoM) labelling
- **What:** Annotate every interactive element on a screenshot with a numbered colored box, send screenshot + box list to a vision LLM. Originated in the MS SoM paper (Yang et al. 2023); WebVoyager popularized it for web agents.
- **MV3:** Yes — pure JS. Inject overlay div, screenshot via `chrome.tabs.captureVisibleTab`, reference indices.
- **License / latest:** MIT (microsoft/SoM). Conceptually stable; no single canonical web library.
- **Verdict:** Big win **only if** you start using a vision-capable LLM and find pure-text DOM is missing things (canvas-based UIs, custom-rendered widgets). Gemini and Claude both consume SoM well. Adds latency and tokens — defer until a concrete need surfaces.
- **Links:** https://arxiv.org/abs/2310.11441 · https://github.com/microsoft/SoM

### Mozilla Readability
- **What:** Powers Firefox Reader View. Standalone JS, extracts main article body. Battle-tested, conservative (sometimes too conservative).
- **MV3:** Yes — drop-in. `~30 KB` minified, no deps.
- **License / latest:** Apache-2.0. Actively maintained, mostly bugfixes.
- **Verdict:** Useful **complement** to the interactive-element list, not a replacement. Use for "summarize this page" style prompts where you want the article body, not the chrome. The current extractor's `text` field is roughly innerText — Readability does better.
- **Link:** https://github.com/mozilla/readability

### Defuddle
- **What:** TS-native Readability alternative from the Obsidian Web Clipper author. Outputs Markdown directly, has site-specific extractors, more forgiving on edge cases.
- **MV3:** Yes — TS, designed to run in browser/Node/CLI.
- **License / latest:** MIT. Released 2025, active.
- **Verdict:** Better choice than Readability if you want Markdown-formatted page text for the LLM prompt. Markdown is more token-efficient and structurally legible than raw innerText.
- **Link:** https://github.com/kepano/defuddle

### WebVoyager / Mind2Web (research benchmarks, not libraries)
- **What:** Academic agents whose published prompt formats use SoM-marked screenshots (WebVoyager) or DOM+HTML hybrid representation (Mind2Web).
- **MV3:** N/A — research code.
- **Verdict:** Worth reading the WebVoyager paper for screenshot-prompt patterns. Don't use the code.
- **Links:** https://osu-nlp-group.github.io/Mind2Web/ · https://arxiv.org/html/2401.13919v3

---

## 2. In-extension DOM action helpers

### Nanobrowser (the closest peer to this repo)
- **What:** Open-source MV3 Chrome extension, multi-LLM (OpenAI/Anthropic/Gemini/Ollama), multi-agent (planner + navigator + validator). TypeScript monorepo.
- **MV3:** Yes — built as MV3 extension. Side panel + background + content scripts.
- **License / latest:** Apache-2.0. v0.1.13, Nov 22 2025.
- **Verdict:** **Read this codebase before changing anything in this repo.** It's the most directly comparable open-source project. Particularly check how they handle the "service worker died mid-turn" problem, action-result message shapes, and selector-vs-index choices. Also lifts much of its DOM-tree code from browser-use.
- **Link:** https://github.com/nanobrowser/nanobrowser

### mcp-chrome (hangwin)
- **What:** MV3 extension that exposes Chrome's tabs/network/DOM as MCP tools to a desktop AI client. Uses `chrome.debugger` for network capture, content scripts for DOM, claims 20+ tools.
- **MV3:** Yes (note: README mentions `webRequest` which is restricted in MV3; verify before adopting patterns).
- **License / latest:** MIT. v1.0.0, Dec 29 2025.
- **Verdict:** Useful reference for the chrome.debugger + content-script split, less useful as a library to depend on (architected as a server, not a UI extension).
- **Link:** https://github.com/hangwin/mcp-chrome

### chrome.debugger / CDP from an extension
- **What:** With the `debugger` permission, an MV3 extension can call almost the full CDP surface: `Input.dispatchMouseEvent` (real synthesized clicks that bypass `pointer-events: none` overlays etc.), `Input.insertText` (proper IME-aware typing), `Runtime.evaluate`, `Accessibility.getFullAXTree`, `DOM.querySelector`, `Page.captureScreenshot`.
- **MV3:** Yes, but **forces a yellow banner** ("Extension started debugging this browser") that can't be hidden, and disables DevTools on the attached tab.
- **License / latest:** Built-in.
- **Verdict:** This is the single biggest robustness lever available in MV3. Hand-rolled `el.click()` / setting `.value` then `dispatchEvent('input')` works ~85% of the time and breaks on React-controlled inputs, contenteditable, custom-element comboboxes, hidden file inputs, drag-and-drop. CDP `Input.*` works ~99%. The banner is the price.
- **Links:** https://developer.chrome.com/docs/extensions/reference/api/debugger · https://chromedevtools.github.io/devtools-protocol/

### Playwright locator strategies (`getByRole`, `getByText`, `getByTestId`)
- **What:** Playwright's locators are the de-facto "robust selector" pattern: prefer role+name (computed accessible name), fall back to text, then testid, last-resort CSS/XPath.
- **MV3:** No code-level port, but **the strategy is portable**. You can implement `findByRoleAndName(role, name)` against the AX tree (via debugger) or against ARIA attributes + computed accessible name in pure DOM.
- **License / latest:** Apache-2.0; Playwright v1.5x active.
- **Verdict:** Adopt the *priority order* in your action dispatcher: when LLM gives a target, resolve role+name before selector. This is the single highest-leverage robustness change.
- **Link:** https://playwright.dev/docs/locators

### rrweb
- **What:** DOM mutation recorder/replayer. Used by PostHog, Sentry, Highlight for session replay.
- **MV3:** Yes — pure JS, no deps. Records well, replay is independent.
- **License / latest:** MIT. Actively maintained.
- **Verdict:** **Not a fit for the agent loop**, but a great fit for **debugging / observability** of agent runs. Recording every turn lets you replay why an action failed. Same use as in test infra. Defer until you want to investigate flakes.
- **Link:** https://github.com/rrweb-io/rrweb

### Other "act on element" libraries
- No widely-adopted MV3-native action-dispatcher library exists. The frontier tooling either (a) uses Playwright/CDP externally or (b) hand-rolls the same `dispatchEvent` cocktail this repo already has. The honest answer for MV3 is: own this code, but make it CDP-backed when possible.

---

## 3. LLM-native tool/function-calling layers

### Anthropic computer-use (`computer_20251124`)
- **What:** Schema-less tool that takes screenshot + coordinate-based actions (`left_click [x,y]`, `type`, `key`, `scroll`, new in 2025-11-24: `zoom`). Designed for desktop/VM; coordinates are 1:1 with image pixels for Opus 4.7.
- **MV3:** Implementable — capture screenshot via `chrome.tabs.captureVisibleTab`, dispatch coords via `chrome.debugger Input.*`. But the model expects a *desktop*, not a browser viewport, so prompting tends to assume window chrome. Works, just awkward.
- **License / latest:** Beta API; current header `computer-use-2025-11-24`. Pricing 735 tokens/tool definition + screenshot tokens.
- **Verdict:** Skip for now — coordinate-based is fragile vs. indexed-element on pure web tasks, and you'd be locking to Anthropic when the backend already targets Gemini/Gauss/agentsec.
- **Link:** https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool

### OpenAI Computer-Using Agent (CUA, "computer-use-preview"/Operator)
- **What:** Same shape as Anthropic's: screenshot + `click(x,y)`, `type`, `keypress`, `scroll`. Model is `computer-use-preview` (or the newer Codex desktop mode released April 2026).
- **MV3:** Same story as Anthropic.
- **Verdict:** Same — skip until you specifically want vision-driven control.

### Vercel AI SDK tools / LangChain tools
- **What:** Standardized tool-definition shape: `{ name, description, parameters: ZodSchema, execute }`. Vercel AI SDK 3.2+ supports client-side tool execution (`onToolCall`) which maps cleanly to "extension executes the action". LangChain's tools follow the same shape, mostly Zod-or-JSON-Schema.
- **MV3:** Yes for both — both ship browser builds. Vercel AI SDK is lighter and is the better fit for an extension.
- **License / latest:** Apache-2.0 / MIT. Vercel AI SDK actively shipping.
- **Verdict:** **Not a fit for *this* architecture** because the LLM is called from the FastAPI backend, not the extension. The `executeAction`/`tool_use` shape on the backend would be where you'd integrate one of these — and even then, your current ad-hoc `LLMAction` discriminated-union is functionally equivalent. Adopt only if the backend grows multi-LLM tool-calling complexity.
- **Links:** https://ai-sdk.dev · https://js.langchain.com

### MCP (Model Context Protocol) browser servers
- **playwright-mcp (Microsoft, official):** ~80 tools, accessibility-tree snapshots (no vision required), Apache-2.0, v0.0.73 May 2026. **MV3: no** — runs as a Node process driving Playwright. Useful as a *backend-side* tool the FastAPI server could call, not in the extension.
- **executeautomation/mcp-playwright:** Earlier community implementation; same shape.
- **mcp-chrome:** Already covered above — MV3-native MCP server that exposes the user's *real* Chrome (via debugger).
- **Verdict:** Only relevant if you want the FastAPI backend to gain a "computer" capability outside the user's browser. Not relevant to improving the in-page extractor.
- **Links:** https://github.com/microsoft/playwright-mcp · https://github.com/hangwin/mcp-chrome

---

## 4. Robustness patterns the field has converged on

### Element addressing: indices > role+name > selectors > XPath > coordinates
The 2025–2026 consensus, in roughly that order:

1. **Short integer indices** (browser-use, Stagehand, Nanobrowser, Playwright-MCP). LLM emits `click(7)`; extension resolves index → element. Fewer tokens, no string-escaping bugs, fewer hallucinations. Index map is rebuilt every turn from the snapshot.
2. **Role + accessible name** (Playwright `getByRole`). Most stable across redesigns of the same site.
3. **CSS selectors** (current state of this repo). Brittle to class-name churn (Tailwind `JIT`, CSS modules, hashed names) but human-readable and DOM-native.
4. **XPath.** More expressive than CSS but harder for LLMs to author correctly.
5. **Pixel coordinates.** Works when nothing else does (canvas, native UI in Electron). Used by Anthropic/OpenAI computer-use.

For an MV3 extension talking to text-based LLMs, **indices + role + accessible name is the sweet spot.**

### Screenshot + SoM vs. text-only DOM
- Pure text DOM: cheaper, deterministic, breaks on canvas/heavy custom rendering and CAPTCHAs.
- Screenshot + SoM: handles visual-only content, costs ~1k-5k vision tokens per turn, requires vision LLM.
- **Hybrid (browser-use default in 2026):** indexed text list AND screenshot with bounding boxes — model uses whichever helps. Highest cost, highest success rate.

### Waiting for stability before snapshotting
Universal pattern: fire and forget no longer works. Either:
- **Network-idle:** wait for `<= 0` (or `<= 2`) in-flight requests for 500 ms (`networkidle0`/`networkidle2`).
- **DOM-stable:** MutationObserver inside `page.evaluate`; resolve when no mutations for 500 ms.
- **Element-targeted:** wait for a specific selector / aria-live region to update.

The current repo has the "retry up to 5x" pattern in `background.ts` — that's the right *spirit* but a MutationObserver-based "wait for DOM stable" is cheaper and more deterministic than retry-on-empty-result.

### Shadow DOM, iframes, dynamic content
- **Shadow DOM (open):** traversable from content scripts via `el.shadowRoot`. Browser-use's `buildDomTree.js` recurses into open roots.
- **Shadow DOM (closed):** invisible to content scripts in MV3. There's an active proposal to grant extensions access; not landed. CDP can sometimes pierce via `DOM.describeNode` `pierce: true`.
- **Same-origin iframes:** content scripts inject into matching frames per manifest's `all_frames: true`. Coordinate via `chrome.runtime` messages.
- **Cross-origin iframes:** separate execution context per frame; same `all_frames: true` injection works, but you need to maintain a frame-id-keyed element index.
- **Dynamic content:** combine MutationObserver + `IntersectionObserver` for lazy-loaded sections; scroll then re-snapshot.

---

## What I'd recommend trying first (ranked by effort/payoff)

### 1. Adopt indexed elements instead of CSS selectors  *[Low effort, high payoff]*
- Replace `selector: string` in `InteractiveElement` with `index: number`, plus a backing `Map<number, Element>` kept in the content script for one turn.
- Add a stable `data-aib-id` ephemeral attribute (cleared after action) so re-resolution survives minor mutations between snapshot and action.
- Update prompt format to `[3]<button>Sign in</button>` per browser-use convention. Cuts tokens, eliminates an entire class of selector-escaping bugs, makes the LLM's life easier.
- Effort: ~1 day. **Read browser-use's `buildDomTree.js` and Nanobrowser's content script first** — they've already solved this and the patterns are MIT/Apache and copy-friendly.

### 2. Resolve actions by role+accessible-name with selector fallback *[Medium effort, high payoff]*
- Have the extractor compute and emit `role` and accessible name for each interactive element (compute via ARIA-aware traversal — there are pure-JS implementations, e.g. `dom-accessibility-api` or `aria-query`).
- Action dispatcher: try `findByRoleAndName` first, fall back to current selector path. Survives redesigns far better than class-name selectors.
- Effort: 1–2 days. Optional: add `dom-accessibility-api` (~10 KB, MIT) which implements the W3C accessible-name algorithm.

### 3. Add `chrome.debugger`-based action dispatch as an opt-in *[Medium-high effort, medium payoff]*
- Behind a setting flag, attach the debugger only when needed (e.g., on first failed action) and use `Input.dispatchMouseEvent` / `Input.insertText` / `Input.dispatchKeyEvent` instead of synthetic events.
- Pros: Robust against React-controlled inputs, contenteditable, custom comboboxes, file inputs.
- Cons: Yellow debugging banner, DevTools disabled on the tab. UX-visible.
- Effort: 2–3 days; defer until you have a concrete failure case the current dispatcher can't handle.

### 4. Add Defuddle for "page text" content *[Low effort, medium payoff if you do summarization-style tasks]*
- Replace the current visible-text extraction with `defuddle` output (Markdown). Gives the LLM cleaner context for tasks that aren't form-filling — summarization, "what's this article about", question-answering.
- Effort: ~half a day. Skip if your product is purely action-oriented.

### Things I'd explicitly *not* do yet
- Don't switch to vision-only Anthropic/OpenAI computer-use — locks the architecture to one provider and is worse than indexed-text on pure web tasks.
- Don't depend on browser-use, Stagehand, or Skyvern as runtime libraries — none drop into MV3, and the parts you'd want (the DOM-traversal scripts, the prompt format) are easier to copy than to bridge.
- Don't add Playwright-MCP — it's a backend tool for driving a *separate* Chromium; doesn't help your in-page extractor.
- Don't add SoM/screenshots until you have a concrete failure case where text-only DOM isn't enough.

---

## Sources

- [browser-use](https://github.com/browser-use/browser-use)
- [Nanobrowser](https://github.com/nanobrowser/nanobrowser) · [website](https://nanobrowser.ai/)
- [Stagehand](https://github.com/browserbase/stagehand) · [Stagehand v3 announcement](https://www.browserbase.com/blog/stagehand-v3)
- [mcp-chrome (hangwin)](https://github.com/hangwin/mcp-chrome)
- [Playwright MCP (Microsoft)](https://github.com/microsoft/playwright-mcp) · [docs](https://playwright.dev/mcp/introduction)
- [Mozilla Readability](https://github.com/mozilla/readability)
- [Defuddle (kepano)](https://github.com/kepano/defuddle) · [Hacker News thread](https://news.ycombinator.com/item?id=44067409)
- [Set-of-Mark paper](https://arxiv.org/abs/2310.11441) · [microsoft/SoM](https://github.com/microsoft/SoM)
- [WebVoyager paper](https://arxiv.org/html/2401.13919v3) · [Mind2Web](https://osu-nlp-group.github.io/Mind2Web/)
- [BrowserGym](https://github.com/ServiceNow/BrowserGym)
- [Anthropic computer-use docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool) · [Anthropic launch post](https://www.anthropic.com/news/3-5-models-and-computer-use)
- [chrome.debugger API](https://developer.chrome.com/docs/extensions/reference/api/debugger) · [Chrome DevTools Protocol](https://chromedevtools.github.io/devtools-protocol/) · [Accessibility domain](https://chromedevtools.github.io/devtools-protocol/tot/Accessibility/)
- [Full accessibility tree in Chrome DevTools](https://developer.chrome.com/blog/full-accessibility-tree)
- [Playwright locators](https://playwright.dev/docs/locators)
- [rrweb](https://github.com/rrweb-io/rrweb)
- [Vercel AI SDK](https://ai-sdk.dev) · [LangChain JS tools](https://js.langchain.com)
- [Skyvern](https://www.ycombinator.com/companies/skyvern) · [aimultiple open-source web agents roundup](https://aimultiple.com/open-source-web-agents)
- [CDP from Extensions (Vashchuk)](https://medium.com/@dzianisv/vibe-engineering-chrome-devtools-protocol-from-extensions-you-dont-need-to-fork-chromium-72a9ffb68b6d)
