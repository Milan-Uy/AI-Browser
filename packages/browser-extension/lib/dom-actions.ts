import type { ActionResult, LLMAction } from "./messaging";
import { getIndexedElement } from "./page-extractor";
import { INTERACTIVE_SELECTOR, getRole, getAccessibleName } from "./a11y";

export async function executeAction(action: LLMAction): Promise<ActionResult> {
  switch (action.kind) {
    case "click":
      return doClick(action);
    case "fill":
      return doFill(action);
    case "select":
      return doSelect(action);
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

export async function resolveByIndex(index: number, timeoutMs = 1500): Promise<HTMLElement | null> {
  const mapped = getIndexedElement(index);
  if (mapped && mapped.isConnected) return mapped;

  const byAttr = document.querySelector<HTMLElement>('[data-aib-id="' + index + '"]');
  if (byAttr) return byAttr;

  return new Promise<HTMLElement | null>((resolve) => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const observer = new MutationObserver(() => {
      const found = document.querySelector<HTMLElement>('[data-aib-id="' + index + '"]');
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
      attributeFilter: ["data-aib-id"],
    });
    timer = setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeoutMs);
  });
}

export function findByRoleAndName(role: string, name: string): HTMLElement | null {
  const normalRole = role.trim().toLowerCase();
  const normalName = name.trim().toLowerCase();
  const candidates = document.querySelectorAll<HTMLElement>(INTERACTIVE_SELECTOR);
  for (const el of candidates) {
    if (getRole(el).toLowerCase() === normalRole && getAccessibleName(el).trim().toLowerCase() === normalName) {
      return el;
    }
  }
  return null;
}

export async function resolveTarget(
  action: { index?: number; role?: string; name?: string },
  timeoutMs = 1500,
): Promise<HTMLElement | null> {
  if (action.index !== undefined) {
    const el = await resolveByIndex(action.index, timeoutMs);
    if (el && el.isConnected) return el;
  }
  if (action.role && action.name) {
    return findByRoleAndName(action.role, action.name);
  }
  return null;
}

async function doClick(a: Extract<LLMAction, { kind: "click" }>): Promise<ActionResult> {
  const el = await resolveTarget(a);
  if (!el) return { ok: false, message: `element not found: index=${a.index} role=${a.role ?? "?"} name=${JSON.stringify(a.name ?? "")} (likely stale; will re-snapshot next turn)` };
  el.scrollIntoView({ block: "center", inline: "center" });
  el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
  return { ok: true };
}

async function doFill(a: Extract<LLMAction, { kind: "fill" }>): Promise<ActionResult> {
  const el = await resolveTarget(a);
  if (!el) return { ok: false, message: `element not found: index=${a.index} role=${a.role ?? "?"} name=${JSON.stringify(a.name ?? "")} (likely stale; will re-snapshot next turn)` };
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) {
    return { ok: false, message: "element is not an input/textarea" };
  }
  const setter = Object.getOwnPropertyDescriptor(
    el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
    "value",
  )?.set;
  if (setter) setter.call(el, a.value);
  else el.value = a.value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  return { ok: true };
}

async function doSelect(a: Extract<LLMAction, { kind: "select" }>): Promise<ActionResult> {
  const el = await resolveTarget(a);
  if (!el) return { ok: false, message: `element not found: index=${a.index} role=${a.role ?? "?"} name=${JSON.stringify(a.name ?? "")} (likely stale; will re-snapshot next turn)` };
  if (!(el instanceof HTMLSelectElement)) {
    return { ok: false, message: "element is not a <select>" };
  }
  el.value = a.value;
  el.dispatchEvent(new Event("change", { bubbles: true }));
  return { ok: true };
}

async function doScroll(a: Extract<LLMAction, { kind: "scroll" }>): Promise<ActionResult> {
  if (a.index !== undefined) {
    const el = await resolveTarget(a);
    if (!el) return { ok: false, message: `element not found: index=${a.index} role=${a.role ?? "?"} name=${JSON.stringify(a.name ?? "")} (likely stale; will re-snapshot next turn)` };
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
