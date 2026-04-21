import { describe, it, expect } from "vitest";
import {
  makeMessage,
  isMessageOfKind,
  type AppMessage,
} from "../messaging";

describe("messaging", () => {
  it("builds a well-formed CHAT_MESSAGE", () => {
    const msg = makeMessage("CHAT_MESSAGE", { text: "hi", includePage: false });
    expect(msg.kind).toBe("CHAT_MESSAGE");
    expect(msg.payload).toEqual({ text: "hi", includePage: false });
  });

  it("narrows via isMessageOfKind", () => {
    const m: AppMessage = makeMessage("AGENT_UPDATE", {
      update: { turn: 1, status: "running", explanation: "hi" },
    });
    if (isMessageOfKind(m, "AGENT_UPDATE")) {
      expect(m.payload.update.turn).toBe(1);
    } else {
      throw new Error("should have narrowed");
    }
  });

  it("rejects a non-matching kind", () => {
    const m: AppMessage = makeMessage("CHAT_MESSAGE", { text: "hi", includePage: true });
    expect(isMessageOfKind(m, "AGENT_UPDATE")).toBe(false);
  });

  it("builds CONFIRM_STEP with a Step payload", () => {
    const m = makeMessage("CONFIRM_STEP", {
      requestId: "r1",
      step: { stepNumber: 1, action: "click", id: 3, name: "Submit" },
    });
    expect(m.payload.step.action).toBe("click");
    expect(m.payload.step.id).toBe(3);
  });
});
