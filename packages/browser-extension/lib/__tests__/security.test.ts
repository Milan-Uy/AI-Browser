import { describe, it, expect, vi, beforeEach } from "vitest";
import { validateAction, createRateLimiter } from "../security";
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
  it("enforces a cooldown between acquires", async () => {
    const rl = createRateLimiter(500);
    expect(await rl.acquire()).toBe(true);
    expect(await rl.acquire()).toBe(false);
    vi.advanceTimersByTime(500);
    expect(await rl.acquire()).toBe(true);
  });
});
