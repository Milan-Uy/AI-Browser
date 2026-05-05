import type { InteractiveElement, PageContent } from "./messaging";

const TEXT_LIMIT = 8000;
const ELEMENT_LIMIT = 200;
const INTERACTIVE_SELECTOR = 'a, button, input, select, textarea, [role="button"]';

export function extractPageContent(): PageContent {
  const text = (document.body?.innerText ?? "").slice(0, TEXT_LIMIT);
  const selection = window.getSelection()?.toString() || undefined;

  const nodes = Array.from(
    document.querySelectorAll<HTMLElement>(INTERACTIVE_SELECTOR),
  );

  const elements: InteractiveElement[] = [];
  for (const el of nodes) {
    if (elements.length >= ELEMENT_LIMIT) break;
    if (el instanceof HTMLInputElement && el.type === "password") continue;
    const info = describeElement(el);
    if (!info) continue;
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

function describeElement(el: HTMLElement): InteractiveElement | null {
  const tag = el.tagName.toLowerCase();
  const text = (el.innerText || el.getAttribute("aria-label") || "").trim().slice(0, 120);
  const selector = buildUniqueSelector(el);
  if (!selector) return null;
  const info: InteractiveElement = { selector, tag, text };
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
  return info;
}

function escapeCSSAttrValue(v: string): string {
  return v.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

export function buildUniqueSelector(el: Element): string {
  if (el.id && /^[A-Za-z][\w-]*$/.test(el.id)) {
    const s = `#${el.id}`;
    if (document.querySelectorAll(s).length === 1) return s;
  }

  const ariaLabel = el.getAttribute("aria-label");
  if (ariaLabel) {
    const s = `${el.tagName.toLowerCase()}[aria-label='${escapeCSSAttrValue(ariaLabel)}']`;
    if (document.querySelectorAll(s).length === 1) return s;
  }

  const testId = el.getAttribute("data-testid");
  if (testId) {
    const s = `[data-testid='${escapeCSSAttrValue(testId)}']`;
    if (document.querySelectorAll(s).length === 1) return s;
  }

  for (const attr of Array.from(el.attributes)) {
    if (!attr.name.startsWith("data-") || attr.name === "data-testid") continue;
    const v = attr.value;
    if (v.length === 0 || v.length > 50 || /\s/.test(v)) continue;
    const s = `[${attr.name}='${escapeCSSAttrValue(v)}']`;
    if (document.querySelectorAll(s).length === 1) return s;
  }

  const parts: string[] = [];
  let cur: Element | null = el;
  while (cur && cur.nodeType === 1 && cur !== document.body) {
    const parent: Element | null = cur.parentElement;
    if (!parent) break;
    const same = Array.from(parent.children).filter(
      (c) => c.tagName === cur!.tagName,
    );
    const idx = same.indexOf(cur) + 1;
    parts.unshift(`${cur.tagName.toLowerCase()}:nth-of-type(${idx})`);
    cur = parent;
  }
  return parts.length ? `body > ${parts.join(" > ")}` : "";
}
