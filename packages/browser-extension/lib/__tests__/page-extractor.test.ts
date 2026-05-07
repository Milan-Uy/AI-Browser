import { describe, it, expect, beforeEach } from "vitest";
import { extractPageContent, getIndexedElement } from "../page-extractor";

function setBody(html: string) {
  document.body.innerHTML = html;
}

describe("page-extractor", () => {
  beforeEach(() => {
    document.title = "Test Page";
    setBody("");
  });

  it("extracts title, url, and text", () => {
    setBody("<p>Hello world</p>");
    const c = extractPageContent();
    expect(c.title).toBe("Test Page");
    expect(c.url).toBe(window.location.href);
    expect(c.text).toContain("Hello world");
  });

  it("truncates text to ~8000 chars", () => {
    setBody("<p>" + "x".repeat(20000) + "</p>");
    const c = extractPageContent();
    expect(c.text.length).toBeLessThanOrEqual(8000);
  });

  it("lists interactive elements but omits password inputs", () => {
    setBody(`
      <button id="b1">Click</button>
      <input type="text" id="t1" placeholder="name"/>
      <input type="password" id="p1" value="secret"/>
      <a id="a1" href="/go">Go</a>
    `);
    const c = extractPageContent();
    const tags = c.elements.map((e) => e.tag);
    expect(tags).toContain("button");
    expect(tags).toContain("a");
    expect(tags).toContain("input");
    expect(c.elements.every((e) => e.type !== "password")).toBe(true);
  });

  it("caps elements at 200", () => {
    const buttons = Array.from({ length: 300 }, (_, i) => `<button>B${i}</button>`).join("");
    setBody(buttons);
    const c = extractPageContent();
    expect(c.elements.length).toBe(200);
  });

  it("indices are sequential starting at 0", () => {
    setBody(`<button>A</button><button>B</button><button>C</button>`);
    const c = extractPageContent();
    expect(c.elements.map((e) => e.index)).toEqual([0, 1, 2]);
  });

  it("each kept element has matching data-aib-id attribute", () => {
    setBody(`<button>A</button><input type="text" /><a href="#">Link</a>`);
    const c = extractPageContent();
    for (const el of c.elements) {
      const dom = document.querySelector(`[data-aib-id="${el.index}"]`);
      expect(dom).not.toBeNull();
    }
  });

  it("second extractPageContent() call clears stale data-aib-id attributes", () => {
    setBody(`<button>A</button>`);
    extractPageContent();
    // Remove the button so its data-aib-id is stale after second call
    document.body.innerHTML = `<input type="text" />`;
    extractPageContent();
    // No element should have data-aib-id="0" pointing to old button
    const stale = document.querySelectorAll("[data-aib-id]");
    expect(stale.length).toBe(1);
    expect(stale[0]!.tagName.toLowerCase()).toBe("input");
  });

  it("getIndexedElement returns the element after extractPageContent", () => {
    setBody(`<button>X</button>`);
    const c = extractPageContent();
    const el = getIndexedElement(c.elements[0]!.index);
    expect(el).not.toBeNull();
    expect(el?.tagName.toLowerCase()).toBe("button");
  });

  it("extracts value attribute for checkbox inputs", () => {
    setBody(`<input type="checkbox" id="c1" value="below-10000">`);
    const c = extractPageContent();
    const el = c.elements.find((e) => e.type === "checkbox");
    expect(el).toBeDefined();
    expect(el?.value).toBe("below-10000");
  });

  it("extracts value attribute for radio inputs", () => {
    setBody(`<input type="radio" name="price" value="above-50000">`);
    const c = extractPageContent();
    const el = c.elements.find((e) => e.type === "radio");
    expect(el).toBeDefined();
    expect(el?.value).toBe("above-50000");
  });

  it("does NOT extract value for text inputs", () => {
    setBody(`<input type="text" id="t1" value="user typed">`);
    const c = extractPageContent();
    const el = c.elements.find((e) => e.type === "text");
    expect(el).toBeDefined();
    expect(el?.value).toBeUndefined();
  });

  it("populates text from label[for] when checkbox has no innerText or aria-label", () => {
    setBody(`
      <input type="checkbox" id="price-1" value="below-10000">
      <label for="price-1">Below ₱10,000</label>
    `);
    const c = extractPageContent();
    const el = c.elements.find((e) => e.type === "checkbox");
    expect(el?.text).toBe("Below ₱10,000");
  });

  it("populates text from wrapping label when checkbox is inside a label", () => {
    setBody(`
      <label>
        <input type="checkbox" value="above-50000">
        Above ₱50,000
      </label>
    `);
    const c = extractPageContent();
    const el = c.elements.find((e) => e.type === "checkbox");
    expect(el?.text).toContain("Above");
  });

  it("aria-label takes precedence over label[for] for checkbox text", () => {
    setBody(`
      <input type="checkbox" id="price-2" aria-label="Under ten thousand" value="below-10000">
      <label for="price-2">Below ₱10,000</label>
    `);
    const c = extractPageContent();
    const el = c.elements.find((e) => e.type === "checkbox");
    expect(el?.text).toBe("Under ten thousand");
  });
});
