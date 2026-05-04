import { describe, it, expect, vi, beforeEach } from "vitest";
import { validateAction, createRateLimiter, isNoopNavigation } from "../security";
import type { LLMAction } from "../messaging";

describe("security.validateAction", () => {
  it("allows https navigation", () => {
    const a: LLMAction = { kind: "navigate", url: "https://example.com/path" };
    expect(validateAction(a)).toEqual({ ok: true });
  });

  it("blocks javascript: navigation", () => {
    const a: LLMAction = { kind: "navigate", url: "javascript:alert(1)" };
    const r = validateAction(a);
    expect(r.ok).toBe(false);
  });

  it("blocks data: navigation", () => {
    expect(validateAction({ kind: "navigate", url: "data:text/html,<h1>x</h1>" }).ok).toBe(false);
  });

  it("blocks chrome:// navigation", () => {
    expect(validateAction({ kind: "navigate", url: "chrome://settings" }).ok).toBe(false);
  });

  it("blocks file:// navigation", () => {
    expect(validateAction({ kind: "navigate", url: "file:///etc/passwd" }).ok).toBe(false);
  });

  it("blocks selectors targeting extension internals", () => {
    const a: LLMAction = { kind: "click", selector: "chrome-extension://abc" };
    expect(validateAction(a).ok).toBe(false);
  });

  it("blocks cross-origin iframe selectors", () => {
    const a: LLMAction = { kind: "click", selector: 'iframe[src^="https://evil.com"]' };
    expect(validateAction(a).ok).toBe(false);
  });
});

describe("security.createRateLimiter", () => {
  beforeEach(() => vi.useFakeTimers());
  it("delays back-to-back acquires by the minimum interval", async () => {
    const rl = createRateLimiter(500);
    expect(await rl.acquire()).toBe(true);

    let secondResolved = false;
    const second = rl.acquire().then((v) => {
      secondResolved = true;
      return v;
    });

    await vi.advanceTimersByTimeAsync(499);
    expect(secondResolved).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    expect(await second).toBe(true);
  });
});

describe("security.isNoopNavigation", () => {
  it("returns true for identical URLs", () => {
    expect(isNoopNavigation("https://samsung.com/refrigerator", "https://samsung.com/refrigerator")).toBe(true);
  });

  it("ignores a trailing slash on either side", () => {
    expect(isNoopNavigation("https://samsung.com/refrigerator/", "https://samsung.com/refrigerator")).toBe(true);
    expect(isNoopNavigation("https://samsung.com/refrigerator", "https://samsung.com/refrigerator/")).toBe(true);
  });

  it("returns false for different hosts", () => {
    expect(isNoopNavigation("https://samsung.com/refrigerator", "https://www.samsung.com/refrigerator")).toBe(false);
  });

  it("returns false for different schemes", () => {
    expect(isNoopNavigation("http://samsung.com/refrigerator", "https://samsung.com/refrigerator")).toBe(false);
  });

  it("returns false for different pathnames", () => {
    expect(isNoopNavigation("https://samsung.com/refrigerator", "https://samsung.com/tv")).toBe(false);
  });

  it("returns false when target and current have different non-empty search strings", () => {
    expect(
      isNoopNavigation(
        "https://samsung.com/refrigerator?q=ice",
        "https://samsung.com/refrigerator?q=fridge",
      ),
    ).toBe(false);
  });

  it("returns true when target has empty search but current has any search", () => {
    expect(
      isNoopNavigation(
        "https://samsung.com/refrigerator",
        "https://samsung.com/refrigerator?ref=ad",
      ),
    ).toBe(true);
  });

  it("ignores hash differences", () => {
    expect(
      isNoopNavigation(
        "https://samsung.com/refrigerator#specs",
        "https://samsung.com/refrigerator#reviews",
      ),
    ).toBe(true);
  });

  it("returns false for malformed target URL", () => {
    expect(isNoopNavigation("not a url", "https://samsung.com/refrigerator")).toBe(false);
  });
});
