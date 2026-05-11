import type { InteractiveElement, PageContent } from "./messaging";
import { INTERACTIVE_SELECTOR, getRole, getAccessibleName } from "./a11y";

const TEXT_LIMIT = 8000;
const ELEMENT_LIMIT = 200;

let elementIndex = new Map<number, HTMLElement>();

export function getIndexedElement(i: number): HTMLElement | null {
  return elementIndex.get(i) ?? null;
}

export function extractPageContent(): PageContent {
  document.querySelectorAll("[data-aib-id]").forEach((e) => e.removeAttribute("data-aib-id"));
  elementIndex.clear();

  const text = (document.body?.innerText ?? "").slice(0, TEXT_LIMIT);
  const selection = window.getSelection()?.toString() || undefined;

  const nodes = Array.from(
    document.querySelectorAll<HTMLElement>(INTERACTIVE_SELECTOR),
  );

  const elements: InteractiveElement[] = [];
  for (const el of nodes) {
    if (elements.length >= ELEMENT_LIMIT) break;
    if (el instanceof HTMLInputElement && el.type === "password") continue;
    const info = describeElement(el, elements.length);
    if (!info) continue;
    el.setAttribute("data-aib-id", String(info.index));
    elementIndex.set(info.index, el);
    elements.push(info);
  }

  return {
    url: window.location.href,
    title: document.title,
    text,
    selection,
    elements,
  };
}

function describeElement(el: HTMLElement, index: number): InteractiveElement | null {
  const tag = el.tagName.toLowerCase();
  const text = (el.innerText || el.getAttribute("aria-label") || "").trim().slice(0, 120);
  const info: InteractiveElement = { index, tag, text };
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
    info.type = (el as HTMLInputElement).type || tag;
    const ph = (el as HTMLInputElement).placeholder;
    if (ph) info.placeholder = ph;
  }
  if (el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio")) {
    const v = el.getAttribute("value");
    if (v) info.value = v;
    if (!info.text) {
      if (el.id) {
        const label = document.querySelector<HTMLLabelElement>(
          `label[for="${CSS.escape(el.id)}"]`,
        );
        if (label) info.text = label.innerText.trim().slice(0, 120);
      }
      if (!info.text) {
        const wrapped = el.closest("label");
        if (wrapped) info.text = wrapped.innerText.trim().slice(0, 120);
      }
    }
  }
  const role = getRole(el);
  if (role) info.role = role;
  const name = getAccessibleName(el);
  if (name) info.name = name;
  return info;
}
