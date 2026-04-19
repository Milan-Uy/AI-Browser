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
});
