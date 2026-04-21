import { describe, it, expect, beforeEach, vi } from "vitest";
import { extractPageState } from "../page-extractor";

function setBody(html: string) {
  document.body.innerHTML = html;
}

beforeEach(() => {
  document.title = "Test Page";
  setBody("");
  // happy-dom returns 0-size rects by default. Stub a non-zero rect.
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    x: 0, y: 0, width: 100, height: 20, top: 0, left: 0, right: 100, bottom: 20, toJSON: () => ({}),
  } as DOMRect);
});

describe("page-extractor.extractPageState", () => {
  it("fills tab info and a timestamp", () => {
    setBody("<button>Go</button>");
    const { pageState } = extractPageState();
    expect(pageState.tab.title).toBe("Test Page");
    expect(pageState.tab.url).toBe(window.location.href);
    expect(pageState.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("groups elements by ARIA role with monotonic numeric ids", () => {
    setBody(`
      <button>First</button>
      <a href="/x">Link</a>
      <button>Second</button>
    `);
    const { pageState, idMap } = extractPageState();
    const buttons = pageState.interactiveElements["button"] ?? [];
    const links = pageState.interactiveElements["link"] ?? [];
    expect(buttons.map((b) => b.name)).toEqual(["First", "Second"]);
    expect(links.map((l) => l.name)).toEqual(["Link"]);
    const allIds = [...buttons, ...links].map((e) => e.id).sort((a, b) => a - b);
    expect(allIds).toEqual([1, 2, 3]);
    expect(idMap.size).toBe(3);
  });

  it("omits password inputs", () => {
    setBody(`<input type="password" /><input type="text" />`);
    const { pageState } = extractPageState();
    const textboxes = pageState.interactiveElements["textbox"] ?? [];
    expect(textboxes.length).toBe(1);
  });

  it("captures disabled state on buttons", () => {
    setBody(`<button disabled>Off</button>`);
    const { pageState } = extractPageState();
    const btn = pageState.interactiveElements["button"]?.[0];
    expect(btn?.state?.disabled).toBe(true);
  });

  it("captures checked state on checkboxes", () => {
    setBody(`<input type="checkbox" checked aria-label="agree" />`);
    const { pageState } = extractPageState();
    const cb = pageState.interactiveElements["checkbox"]?.[0];
    expect(cb?.state?.checked).toBe(true);
    expect(cb?.name).toBe("agree");
  });

  it("renders interactiveElementsString with [id] role \"name\" lines", () => {
    setBody(`<button>Click me</button><a href="/x">Go</a>`);
    const { pageState } = extractPageState();
    expect(pageState.interactiveElementsString).toMatch(/\[1\] button "Click me"/);
    expect(pageState.interactiveElementsString).toMatch(/\[2\] link "Go"/);
    expect(pageState.interactiveElementsString).toMatch(/^# button/m);
    expect(pageState.interactiveElementsString).toMatch(/^# link/m);
  });

  it("caps extraction at 200 elements", () => {
    const buttons = Array.from({ length: 300 }, (_, i) => `<button>B${i}</button>`).join("");
    setBody(buttons);
    const { pageState, idMap } = extractPageState();
    const count = Object.values(pageState.interactiveElements).reduce((n, a) => n + a.length, 0);
    expect(count).toBe(200);
    expect(idMap.size).toBe(200);
  });
});
