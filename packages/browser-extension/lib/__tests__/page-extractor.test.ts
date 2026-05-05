import { describe, it, expect, beforeEach } from "vitest";
import { extractPageContent, buildUniqueSelector } from "../page-extractor";

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

  it("buildUniqueSelector prefers id when present", () => {
    setBody(`<button id="my-btn">X</button>`);
    const btn = document.querySelector("button")!;
    expect(buildUniqueSelector(btn)).toBe("#my-btn");
  });

  it("buildUniqueSelector falls back to nth-of-type path", () => {
    setBody(`<div><button>A</button><button>B</button></div>`);
    const btns = document.querySelectorAll("button");
    const sel = buildUniqueSelector(btns[1]!);
    expect(document.querySelector(sel)).toBe(btns[1]);
  });

  it("buildUniqueSelector prefers aria-label selector when unique", () => {
    setBody(`<button aria-label="Price">X</button>`);
    const btn = document.querySelector("button")!;
    expect(buildUniqueSelector(btn)).toBe(`button[aria-label='Price']`);
  });

  it("buildUniqueSelector falls back to positional when aria-label is not unique", () => {
    setBody(`<button aria-label="Close">A</button><button aria-label="Close">B</button>`);
    const btn = document.querySelector("button")!;
    const sel = buildUniqueSelector(btn);
    expect(sel).not.toContain("aria-label");
    expect(document.querySelector(sel)).toBe(btn);
  });

  it("buildUniqueSelector prefers data-testid when unique and no aria-label", () => {
    setBody(`<button data-testid="price-btn">X</button>`);
    const btn = document.querySelector("button")!;
    expect(buildUniqueSelector(btn)).toBe(`[data-testid='price-btn']`);
  });

  it("buildUniqueSelector uses other data-* attribute when unique", () => {
    setBody(`<button data-cy="price-btn">X</button>`);
    const btn = document.querySelector("button")!;
    expect(buildUniqueSelector(btn)).toBe(`[data-cy='price-btn']`);
  });

  it("buildUniqueSelector skips data-* values longer than 50 chars", () => {
    setBody(`<button data-foo="${"a".repeat(51)}">X</button>`);
    const btn = document.querySelector("button")!;
    const sel = buildUniqueSelector(btn);
    expect(sel).not.toContain("data-foo");
  });

  it("buildUniqueSelector skips data-* values with whitespace", () => {
    setBody(`<button data-foo="hello world">X</button>`);
    const btn = document.querySelector("button")!;
    const sel = buildUniqueSelector(btn);
    expect(sel).not.toContain("data-foo");
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

  it("buildUniqueSelector falls back to positional when aria-label contains quotes", () => {
    const btn = document.createElement("button");
    btn.setAttribute("aria-label", "it's here");
    document.body.appendChild(btn);
    const sel = buildUniqueSelector(btn);
    // happy-dom can't parse escaped quotes in CSS selectors, so it falls back to positional
    expect(document.querySelector(sel)).toBe(btn);
  });
});
