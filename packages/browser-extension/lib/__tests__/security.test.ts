import { describe, it, expect, vi, beforeEach } from "vitest";
import { validateStep, createRateLimiter } from "../security";
import type { Step } from "../messaging";

function step(partial: Partial<Step> & { action: Step["action"] }): Step {
  return { stepNumber: 1, id: 0, name: "", ...partial };
}

describe("security.validateStep", () => {
  it("allows https navigation", () => {
    expect(validateStep(step({ action: "navigate", value: "https://example.com/path" }))).toEqual({ ok: true });
  });

  it("blocks javascript: navigation", () => {
    expect(validateStep(step({ action: "navigate", value: "javascript:alert(1)" })).ok).toBe(false);
  });

  it("blocks data: navigation", () => {
    expect(validateStep(step({ action: "navigate", value: "data:text/html,<h1>x</h1>" })).ok).toBe(false);
  });

  it("blocks chrome:// navigation", () => {
    expect(validateStep(step({ action: "navigate", value: "chrome://settings" })).ok).toBe(false);
  });

  it("blocks file:// navigation", () => {
    expect(validateStep(step({ action: "navigate", value: "file:///etc/passwd" })).ok).toBe(false);
  });

  it("allows click, type, scroll without URL checks", () => {
    expect(validateStep(step({ action: "click", id: 3 })).ok).toBe(true);
    expect(validateStep(step({ action: "type", id: 3, value: "hello" })).ok).toBe(true);
    expect(validateStep(step({ action: "scroll", id: 0 })).ok).toBe(true);
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
