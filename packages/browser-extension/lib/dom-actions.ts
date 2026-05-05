import type { ActionResult, LLMAction } from "./messaging";

export async function executeAction(action: LLMAction): Promise<ActionResult> {
  switch (action.kind) {
    case "click":
      return doClick(action.selector);
    case "fill":
      return doFill(action.selector, action.value);
    case "select":
      return doSelect(action.selector, action.value);
    case "scroll":
      return doScroll(action);
    case "navigate":
      return doNavigate(action.url);
    default: {
      const _exhaustive: never = action;
      void _exhaustive;
      return { ok: false, message: "unknown action" };
    }
  }
}

function findBySemanticFallback(selector: string): HTMLElement | null {
  const ariaMatch = selector.match(
    /^([a-z][a-z0-9-]*)?\[aria-label\s*=\s*['"](.+?)['"]\]/i,
  );
  if (ariaMatch) {
    const tag: string = ariaMatch[1] ?? "*";
    const rawValue = ariaMatch[2];
    if (rawValue) {
      const value = rawValue.toLowerCase();
      const found = Array.from(document.querySelectorAll<HTMLElement>(tag)).find(
        (el) => el.getAttribute("aria-label")?.toLowerCase() === value,
      );
      if (found) return found;
    }
  }

  const tagMatch = selector.match(/^([a-z][a-z0-9-]*)/i);
  const textMatch = selector.match(/['"](.+?)['"]/);
  const rawTag = tagMatch?.[1];
  const rawText = textMatch?.[1];
  if (rawTag && rawText) {
    const value = rawText.toLowerCase();
    const found = Array.from(document.querySelectorAll<HTMLElement>(rawTag)).find(
      (el) => el.innerText?.trim().toLowerCase() === value,
    );
    if (found) return found;
  }

  return null;
}

export function waitForElement(selector: string, timeoutMs = 1500): Promise<HTMLElement | null> {
  let el: HTMLElement | null = null;
  try {
    el = document.querySelector<HTMLElement>(selector);
  } catch {
    return Promise.resolve(findBySemanticFallback(selector));
  }
  if (el) return Promise.resolve(el);

  return new Promise<HTMLElement | null>((resolve) => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const observer = new MutationObserver(() => {
      let found: HTMLElement | null = null;
      try {
        found = document.querySelector<HTMLElement>(selector);
      } catch {
        // invalid selector
      }
      if (found) {
        observer.disconnect();
        if (timer !== null) clearTimeout(timer);
        resolve(found);
      }
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["hidden", "aria-hidden", "style", "class"],
    });
    timer = setTimeout(() => {
      observer.disconnect();
      resolve(findBySemanticFallback(selector));
    }, timeoutMs);
  });
}

async function doClick(selector: string): Promise<ActionResult> {
  const el = await waitForElement(selector);
  if (!el) return { ok: false, message: `element not found: ${selector}` };
  el.scrollIntoView({ block: "center", inline: "center" });
  el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
  return { ok: true };
}

async function doFill(selector: string, value: string): Promise<ActionResult> {
  const el = await waitForElement(selector);
  if (!el) return { ok: false, message: `element not found: ${selector}` };
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
    return { ok: false, message: "element is not an input/textarea" };
  }
  const setter = Object.getOwnPropertyDescriptor(
    el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
    "value",
  )?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  return { ok: true };
}

async function doSelect(selector: string, value: string): Promise<ActionResult> {
  const el = await waitForElement(selector);
  if (!el) return { ok: false, message: `element not found: ${selector}` };
  if (!(el instanceof HTMLSelectElement)) {
    return { ok: false, message: "element is not a <select>" };
  }
  el.value = value;
  el.dispatchEvent(new Event("change", { bubbles: true }));
  return { ok: true };
}

async function doScroll(a: Extract<LLMAction, { kind: "scroll" }>): Promise<ActionResult> {
  if (a.selector) {
    const el = await waitForElement(a.selector);
    if (!el) return { ok: false, message: `element not found: ${a.selector}` };
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    return { ok: true };
  }
  const amount = a.amount ?? window.innerHeight * 0.8;
  switch (a.direction) {
    case "up":    window.scrollBy({ top: -amount, behavior: "smooth" }); break;
    case "down":  window.scrollBy({ top:  amount, behavior: "smooth" }); break;
    case "top":   window.scrollTo({ top: 0,                behavior: "smooth" }); break;
    case "bottom":window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }); break;
    default:      window.scrollBy({ top:  amount, behavior: "smooth" });
  }
  return { ok: true };
}

function doNavigate(url: string): ActionResult {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, message: "invalid URL" };
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { ok: false, message: `blocked scheme: ${parsed.protocol}` };
  }
  window.location.href = parsed.toString();
  return { ok: true };
}
