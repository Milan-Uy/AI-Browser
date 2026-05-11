import { computeAccessibleName } from "dom-accessibility-api";

export const INTERACTIVE_SELECTOR = 'a, button, input, select, textarea, [role="button"]';

export function getRole(el: HTMLElement): string {
  const explicit = el.getAttribute("role");
  if (explicit) return explicit;
  const tag = el.tagName.toLowerCase();
  if (tag === "a") return el.hasAttribute("href") ? "link" : "";
  if (tag === "button") return "button";
  if (tag === "select") return "combobox";
  if (tag === "textarea") return "textbox";
  if (tag === "input") {
    const t = (el as HTMLInputElement).type || "text";
    if (t === "checkbox") return "checkbox";
    if (t === "radio") return "radio";
    if (t === "submit" || t === "button" || t === "reset") return "button";
    return "textbox";
  }
  return "";
}

export function getAccessibleName(el: HTMLElement): string {
  return computeAccessibleName(el).trim().slice(0, 120);
}
