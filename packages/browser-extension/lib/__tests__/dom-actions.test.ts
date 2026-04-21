import { describe, it, expect, beforeEach, vi } from "vitest";
import { executeStep } from "../dom-actions";
import type { Step } from "../messaging";

function step(partial: Partial<Step> & { action: Step["action"]; id: number }): Step {
  return { stepNumber: 1, name: "", ...partial };
}

describe("dom-actions.executeStep", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("clicks an element resolved via idMap", async () => {
    document.body.innerHTML = `<button id="b">Go</button>`;
    const btn = document.getElementById("b")!;
    const idMap = new Map<number, HTMLElement>([[1, btn]]);
    const spy = vi.fn();
    btn.addEventListener("click", spy);
    const res = await executeStep(step({ action: "click", id: 1 }), idMap);
    expect(res.ok).toBe(true);
    expect(spy).toHaveBeenCalled();
  });

  it("types into an input and dispatches input+change events", async () => {
    document.body.innerHTML = `<input id="t" />`;
    const input = document.getElementById("t") as HTMLInputElement;
    const idMap = new Map<number, HTMLElement>([[2, input]]);
    const events: string[] = [];
    input.addEventListener("input", () => events.push("input"));
    input.addEventListener("change", () => events.push("change"));
    const res = await executeStep(step({ action: "type", id: 2, value: "hello" }), idMap);
    expect(res.ok).toBe(true);
    expect(input.value).toBe("hello");
    expect(events).toEqual(["input", "change"]);
  });

  it("returns not-ok for a stale id", async () => {
    const res = await executeStep(step({ action: "click", id: 99 }), new Map());
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/stale/i);
  });

  it("rejects switchTab (must be handled by background)", async () => {
    const res = await executeStep(step({ action: "switchTab", id: 1 }), new Map());
    expect(res.ok).toBe(false);
  });

  it("blocks invalid navigate URLs", async () => {
    const res = await executeStep(
      step({ action: "navigate", id: 0, value: "javascript:alert(1)" }),
      new Map(),
    );
    expect(res.ok).toBe(false);
  });
});
