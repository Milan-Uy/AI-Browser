import type { Step, StepResult } from "./messaging";

export async function executeStep(
  step: Step,
  idMap: Map<number, HTMLElement>,
): Promise<StepResult> {
  switch (step.action) {
    case "click":
      return withElement(step, idMap, (el) => {
        el.scrollIntoView({ block: "center", inline: "center" });
        el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
        return { ok: true };
      });
    case "hover":
      return withElement(step, idMap, (el) => {
        el.dispatchEvent(new MouseEvent("mouseover", { bubbles: true, cancelable: true, view: window }));
        el.dispatchEvent(new MouseEvent("mousemove", { bubbles: true, cancelable: true, view: window }));
        return { ok: true };
      });
    case "type":
      return doType(step, idMap);
    case "scroll":
      return doScroll(step, idMap);
    case "waitForPageReady":
      return waitForPageReady();
    case "goBack":
      history.back();
      return { ok: true };
    case "goForward":
      history.forward();
      return { ok: true };
    case "refresh":
      location.reload();
      return { ok: true };
    case "navigate": {
      const url = step.value ?? "";
      try {
        const parsed = new URL(url);
        if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
          return { ok: false, message: `blocked scheme: ${parsed.protocol}` };
        }
        window.location.href = parsed.toString();
        return { ok: true };
      } catch {
        return { ok: false, message: "invalid URL" };
      }
    }
    case "switchTab":
      return { ok: false, message: "switchTab must be handled by background" };
    default: {
      const _exhaustive: never = step.action;
      void _exhaustive;
      return { ok: false, message: `unknown action: ${String(step.action)}` };
    }
  }
}

function withElement(
  step: Step,
  idMap: Map<number, HTMLElement>,
  fn: (el: HTMLElement) => StepResult,
): StepResult {
  const el = idMap.get(step.id);
  if (!el) return { ok: false, message: `stale element id: ${step.id}` };
  if (!el.isConnected) return { ok: false, message: `element detached: ${step.id}` };
  return fn(el);
}

function doType(step: Step, idMap: Map<number, HTMLElement>): StepResult {
  const el = idMap.get(step.id);
  if (!el) return { ok: false, message: `stale element id: ${step.id}` };
  const value = step.value ?? "";
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    const proto =
      el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (setter) setter.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    return { ok: true };
  }
  if (el.getAttribute("contenteditable") === "true") {
    el.focus();
    el.textContent = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    return { ok: true };
  }
  return { ok: false, message: "element is not typable" };
}

function doScroll(step: Step, idMap: Map<number, HTMLElement>): StepResult {
  if (step.id > 0) {
    const el = idMap.get(step.id);
    if (!el) return { ok: false, message: `stale element id: ${step.id}` };
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    return { ok: true };
  }
  const direction = (step.value ?? "down").toLowerCase();
  const amount = window.innerHeight * 0.8;
  switch (direction) {
    case "up": window.scrollBy({ top: -amount, behavior: "smooth" }); break;
    case "top": window.scrollTo({ top: 0, behavior: "smooth" }); break;
    case "bottom": window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }); break;
    default: window.scrollBy({ top: amount, behavior: "smooth" });
  }
  return { ok: true };
}

async function waitForPageReady(): Promise<StepResult> {
  const deadline = Date.now() + 5000;
  while (document.readyState !== "complete" && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 100));
  }
  await new Promise((r) => setTimeout(r, 500));
  return { ok: true };
}
