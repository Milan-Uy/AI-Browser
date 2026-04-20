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
  return info;
}

export function buildUniqueSelector(el: Element): string {
  if (el.id && /^[A-Za-z][\w-]*$/.test(el.id)) {
    const s = `#${el.id}`;
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
