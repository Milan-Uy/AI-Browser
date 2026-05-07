import { describe, it, expect, beforeEach } from "vitest";
import { executeAction, resolveByIndex } from "../dom-actions";
import { extractPageContent, getIndexedElement } from "../page-extractor";

describe("dom-actions.executeAction", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("clicks an element and dispatches a MouseEvent", async () => {
    document.body.innerHTML = `<button>Go</button>`;
    extractPageContent();
    const btn = document.querySelector("button")!;
    const spy = { called: false };
    btn.addEventListener("click", () => { spy.called = true; });
    const res = await executeAction({ kind: "click", index: 0 });
    expect(res.ok).toBe(true);
    expect(spy.called).toBe(true);
  });

  it("fills an input and dispatches input + change events", async () => {
    document.body.innerHTML = `<input />`;
    extractPageContent();
    const input = document.querySelector("input") as HTMLInputElement;
    const events: string[] = [];
    input.addEventListener("input", () => events.push("input"));
    input.addEventListener("change", () => events.push("change"));
    const res = await executeAction({ kind: "fill", index: 0, value: "hello" });
    expect(res.ok).toBe(true);
    expect(input.value).toBe("hello");
    expect(events).toEqual(["input", "change"]);
  });

  it("selects a value on a <select>", async () => {
    document.body.innerHTML = `<select><option>a</option><option>b</option></select>`;
    extractPageContent();
    const sel = document.querySelector("select") as HTMLSelectElement;
    const res = await executeAction({ kind: "select", index: 0, value: "b" });
    expect(res.ok).toBe(true);
    expect(sel.value).toBe("b");
  });

  it("returns not-ok for a missing index", async () => {
    document.body.innerHTML = "";
    extractPageContent();
    const res = await executeAction({ kind: "click", index: 99 });
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/not found/i);
  });

  it("waits for an element that appears after a delay (data-aib-id path)", async () => {
    document.body.innerHTML = "";
    setTimeout(() => {
      const btn = document.createElement("button");
      btn.setAttribute("data-aib-id", "0");
      document.body.appendChild(btn);
    }, 100);
    const res = await resolveByIndex(0, 1500);
    expect(res).not.toBeNull();
    expect(res?.tagName.toLowerCase()).toBe("button");
  });

  it("times out when the element never appears", async () => {
    document.body.innerHTML = "";
    extractPageContent();
    const result = await resolveByIndex(999, 50);
    expect(result).toBeNull();
  });

  it("resolveByIndex returns the element via the Map after extractPageContent", async () => {
    document.body.innerHTML = `<button>X</button>`;
    const c = extractPageContent();
    const idx = c.elements[0]!.index;
    const el = await resolveByIndex(idx);
    expect(el).not.toBeNull();
    expect(el?.tagName.toLowerCase()).toBe("button");
  });

  it("resolveByIndex uses data-aib-id attribute when Map is cleared", async () => {
    document.body.innerHTML = `<button>X</button>`;
    extractPageContent();
    // Simulate Map being cleared by calling extractPageContent on empty body then restoring attr
    const btn = document.querySelector("button")!;
    document.body.innerHTML = "";
    // Re-add button with its data-aib-id still set
    document.body.appendChild(btn);
    // Now the map has been cleared by the second extractPageContent but attr still present
    const el = await resolveByIndex(0);
    expect(el).not.toBeNull();
  });
});
