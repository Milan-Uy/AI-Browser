import { describe, it, expect, beforeEach, vi } from "vitest";
import { executeAction, waitForElement } from "../dom-actions";

describe("dom-actions.executeAction", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("clicks an element and dispatches a MouseEvent", async () => {
    document.body.innerHTML = `<button id="b">Go</button>`;
    const btn = document.getElementById("b")!;
    const spy = vi.fn();
    btn.addEventListener("click", spy);
    const res = await executeAction({ kind: "click", selector: "#b" });
    expect(res.ok).toBe(true);
    expect(spy).toHaveBeenCalled();
  });

  it("fills an input and dispatches input + change events", async () => {
    document.body.innerHTML = `<input id="t" />`;
    const input = document.getElementById("t") as HTMLInputElement;
    const events: string[] = [];
    input.addEventListener("input", () => events.push("input"));
    input.addEventListener("change", () => events.push("change"));
    const res = await executeAction({ kind: "fill", selector: "#t", value: "hello" });
    expect(res.ok).toBe(true);
    expect(input.value).toBe("hello");
    expect(events).toEqual(["input", "change"]);
  });

  it("selects a value on a <select>", async () => {
    document.body.innerHTML = `<select id="s"><option>a</option><option>b</option></select>`;
    const sel = document.getElementById("s") as HTMLSelectElement;
    const res = await executeAction({ kind: "select", selector: "#s", value: "b" });
    expect(res.ok).toBe(true);
    expect(sel.value).toBe("b");
  });

  it("returns not-ok for a missing selector", async () => {
    const res = await executeAction({ kind: "click", selector: "#missing" });
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/not found/i);
  });

  it("waits for an element that appears after a delay", async () => {
    document.body.innerHTML = "";
    setTimeout(() => {
      document.body.innerHTML = '<button id="late">Go</button>';
    }, 100);
    const res = await executeAction({ kind: "click", selector: "#late" });
    expect(res.ok).toBe(true);
  });

  it("times out when the element never appears", async () => {
    document.body.innerHTML = "";
    const result = await waitForElement("#never", 50);
    expect(result).toBeNull();
  });

  it("finds element by aria-label when CSS selector fails to match", async () => {
    document.body.innerHTML = `<button aria-label="Price">Sort</button>`;
    const result = await waitForElement("button[aria-label='Price']", 50);
    expect(result).not.toBeNull();
    expect(result?.getAttribute("aria-label")).toBe("Price");
  });

  it("finds element by aria-label case-insensitively", async () => {
    document.body.innerHTML = `<button aria-label="Price">Sort</button>`;
    const result = await waitForElement("button[aria-label='price']", 50);
    expect(result).not.toBeNull();
  });

  it("returns null when aria-label value matches nothing", async () => {
    document.body.innerHTML = `<button aria-label="Size">Sort</button>`;
    const result = await waitForElement("button[aria-label='Price']", 50);
    expect(result).toBeNull();
  });

  it("finds element by innerText fallback when aria-label absent", async () => {
    document.body.innerHTML = `<button>Price</button>`;
    const result = await waitForElement("button[aria-label='Price']", 50);
    expect(result).not.toBeNull();
    expect(result?.innerText).toBe("Price");
  });
});

describe("findBySemanticFallback — value and label strategies", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("finds checkbox by value attribute (Strategy 3)", async () => {
    document.body.innerHTML = `<input type="checkbox" value="below-10000">`;
    const el = await waitForElement("input[value='below-10000']", 50);
    expect(el).not.toBeNull();
    expect(el?.getAttribute("value")).toBe("below-10000");
  });

  it("finds checkbox by label[for] text — selector uses ₱ (real LLM output)", async () => {
    document.body.innerHTML = `
      <input type="checkbox" id="p1" value="x">
      <label for="p1">Below ₱10,000</label>
    `;
    const el = await waitForElement("input[value='Below ₱10,000']", 50);
    expect(el).not.toBeNull();
    expect((el as HTMLInputElement).id).toBe("p1");
  });

  it("finds radio by wrapping label text (Strategy 4 via closest)", async () => {
    document.body.innerHTML = `
      <label><input type="radio" value="y"><span>Below ₱10,000</span></label>
    `;
    const el = await waitForElement("input[value='Below ₱10,000']", 50);
    expect(el).not.toBeNull();
  });

  it("normalizes ₱ to P when matching label text (Strategy 4)", async () => {
    document.body.innerHTML = `
      <input type="checkbox" id="c2" value="slug">
      <label for="c2">Below ₱10,000</label>
    `;
    // selector value 'Below P10,000' normalizes to 'below p10000'
    // label text 'Below ₱10,000' also normalizes to 'below p10000' — match
    const el = await waitForElement("input[value='Below P10,000']", 50);
    expect(el).not.toBeNull();
    expect((el as HTMLInputElement).id).toBe("c2");
  });
});
