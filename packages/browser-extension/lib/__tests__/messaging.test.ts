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
    const m: AppMessage = makeMessage("STREAM_CHUNK", {
      requestId: "r1",
      chunk: { type: "text", content: "hello" },
    });
    if (isMessageOfKind(m, "STREAM_CHUNK")) {
      expect(m.payload.chunk.type).toBe("text");
    } else {
      throw new Error("should have narrowed");
    }
  });

  it("rejects a non-matching kind", () => {
    const m: AppMessage = makeMessage("CHAT_MESSAGE", { text: "hi", includePage: true });
    expect(isMessageOfKind(m, "STREAM_CHUNK")).toBe(false);
  });
});
