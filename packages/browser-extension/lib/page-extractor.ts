import {
  INTERACTIVE_AX_ROLES,
  type BrowserElementData,
  type ElementBounds,
  type ElementState,
  type InteractiveElementsMap,
  type InteractiveRole,
  type PageState,
} from "./messaging";

const ELEMENT_LIMIT = 200;
const NAME_LIMIT = 120;
const CANDIDATE_SELECTOR =
  'a, button, input, select, textarea, [role], [tabindex], summary, [contenteditable="true"]';

const INTERACTIVE_ROLE_SET: ReadonlySet<string> = new Set(INTERACTIVE_AX_ROLES);

const TAG_ROLE: Record<string, InteractiveRole> = {
  a: "link",
  button: "button",
  select: "combobox",
  textarea: "textbox",
  summary: "button",
};

const INPUT_TYPE_ROLE: Record<string, InteractiveRole> = {
  button: "button",
  submit: "button",
  reset: "button",
  image: "button",
  checkbox: "checkbox",
  radio: "radio",
  range: "slider",
  number: "spinbutton",
  search: "searchbox",
  text: "textbox",
  email: "textbox",
  tel: "textbox",
  url: "textbox",
  password: "textbox",
};

export interface ExtractResult {
  pageState: PageState;
  idMap: Map<number, HTMLElement>;
}

export function extractPageState(): ExtractResult {
  const nodes = Array.from(
    document.querySelectorAll<HTMLElement>(CANDIDATE_SELECTOR),
  );

  const idMap = new Map<number, HTMLElement>();
  const grouped: InteractiveElementsMap = {};
  let nextId = 1;

  for (const el of nodes) {
    if (idMap.size >= ELEMENT_LIMIT) break;
    if (el instanceof HTMLInputElement && el.type === "password") continue;
    if (!isVisible(el)) continue;

    const role = resolveRole(el);
    if (!role) continue;

    const bounds = toBounds(el.getBoundingClientRect());
    if (bounds.width === 0 && bounds.height === 0) continue;

    const name = accessibleName(el);
    const state = captureState(el);

    const data: BrowserElementData = {
      id: nextId++,
      role,
      name,
      tagName: el.tagName.toLowerCase(),
      bounds,
    };
    if (state) data.state = state;

    (grouped[role] ??= []).push(data);
    idMap.set(data.id, el);
  }

  const interactiveElementsString = renderElementsString(grouped);

  const pageState: PageState = {
    interactiveElements: grouped,
    interactiveElementsString,
    tab: {
      id: 0,
      title: document.title,
      url: window.location.href,
    },
    timestamp: new Date().toISOString(),
  };

  return { pageState, idMap };
}

function isVisible(el: HTMLElement): boolean {
  if (el.hidden) return false;
  if (el.getAttribute("aria-hidden") === "true") return false;
  const style = el.ownerDocument?.defaultView?.getComputedStyle(el);
  if (style) {
    if (style.display === "none" || style.visibility === "hidden") return false;
  }
  return true;
}

function resolveRole(el: HTMLElement): string | null {
  const explicit = el.getAttribute("role");
  if (explicit && INTERACTIVE_ROLE_SET.has(explicit)) return explicit;

  const tag = el.tagName.toLowerCase();
  if (tag === "input") {
    const t = (el as HTMLInputElement).type.toLowerCase();
    return INPUT_TYPE_ROLE[t] ?? "textbox";
  }
  const implicit = TAG_ROLE[tag];
  if (implicit) return implicit;

  if (el.hasAttribute("tabindex") && el.tabIndex >= 0) {
    if (el.getAttribute("contenteditable") === "true") return "textbox";
  }
  return null;
}

function toBounds(r: DOMRect): ElementBounds {
  return {
    x: Math.round(r.x),
    y: Math.round(r.y),
    width: Math.round(r.width),
    height: Math.round(r.height),
  };
}

function accessibleName(el: HTMLElement): string {
  const aria = el.getAttribute("aria-label");
  if (aria) return trim(aria);

  const labelledBy = el.getAttribute("aria-labelledby");
  if (labelledBy) {
    const ref = labelledBy
      .split(/\s+/)
      .map((id) => el.ownerDocument?.getElementById(id)?.innerText ?? "")
      .join(" ")
      .trim();
    if (ref) return trim(ref);
  }

  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
    if (el.labels && el.labels.length > 0) {
      const label = Array.from(el.labels)
        .map((l) => l.innerText)
        .join(" ")
        .trim();
      if (label) return trim(label);
    }
    const ph = (el as HTMLInputElement).placeholder;
    if (ph) return trim(ph);
    if (el instanceof HTMLInputElement && el.type === "submit" && el.value) return trim(el.value);
  }

  const text = (el.innerText || "").trim();
  if (text) return trim(text);

  const alt = el.getAttribute("alt");
  if (alt) return trim(alt);

  const title = el.getAttribute("title");
  if (title) return trim(title);

  return "";
}

function trim(s: string): string {
  const collapsed = s.replace(/\s+/g, " ").trim();
  return collapsed.length > NAME_LIMIT ? collapsed.slice(0, NAME_LIMIT) + "…" : collapsed;
}

function captureState(el: HTMLElement): ElementState | undefined {
  const s: ElementState = {};
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement || el instanceof HTMLButtonElement) {
    if (el.disabled) s.disabled = true;
  } else if (el.getAttribute("aria-disabled") === "true") {
    s.disabled = true;
  }

  if (el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio")) {
    s.checked = el.checked;
  } else {
    const ariaChecked = el.getAttribute("aria-checked");
    if (ariaChecked === "true" || ariaChecked === "false") s.checked = ariaChecked === "true";
  }

  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    if (el.value) s.value = el.value.slice(0, NAME_LIMIT);
  } else if (el instanceof HTMLSelectElement) {
    s.value = el.value;
  }

  if (el.ownerDocument?.activeElement === el) s.focused = true;

  const expanded = el.getAttribute("aria-expanded");
  if (expanded === "true" || expanded === "false") s.expanded = expanded === "true";

  const haspopup = el.getAttribute("aria-haspopup");
  if (haspopup && haspopup !== "false") s.haspopup = haspopup;

  return Object.keys(s).length > 0 ? s : undefined;
}

function renderElementsString(map: InteractiveElementsMap): string {
  const lines: string[] = [];
  const roleOrder = [
    ...INTERACTIVE_AX_ROLES.filter((r) => map[r]?.length),
    ...Object.keys(map).filter((r) => !INTERACTIVE_ROLE_SET.has(r)),
  ];
  for (const role of roleOrder) {
    const items = map[role];
    if (!items?.length) continue;
    lines.push(`# ${role}`);
    for (const item of items) {
      const name = item.name ? `"${item.name}"` : '""';
      const props = renderProps(item.state);
      lines.push(`[${item.id}] ${role} ${name}${props ? " " + props : ""}`);
    }
  }
  return lines.join("\n");
}

function renderProps(state: ElementState | undefined): string {
  if (!state) return "";
  const parts: string[] = [];
  for (const [k, v] of Object.entries(state)) {
    if (v === undefined || v === null || v === "" || v === false) continue;
    if (typeof v === "string") parts.push(`${k}=${JSON.stringify(v)}`);
    else parts.push(`${k}=${v}`);
  }
  return parts.join(" ");
}
