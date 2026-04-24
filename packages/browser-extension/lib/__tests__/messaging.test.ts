import { describe, it, expect } from "vitest";
import {
  makeMessage,
  isMessageOfKind,
  type AppMessage,
  type StreamChunk,
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

  it("builds CONFIRM_RUN with prompt", () => {
    const msg = makeMessage("CONFIRM_RUN", { requestId: "abc", prompt: "log me in" });
    expect(msg.kind).toBe("CONFIRM_RUN");
    expect(msg.payload.prompt).toBe("log me in");
  });

  it("builds RUN_APPROVED", () => {
    const msg = makeMessage("RUN_APPROVED", { requestId: "abc", approved: true });
    expect(msg.kind).toBe("RUN_APPROVED");
    expect(msg.payload.approved).toBe(true);
  });

  it("done chunk carries optional completed flag", () => {
    const chunk: StreamChunk = { type: "done", completed: false };
    expect(chunk.completed).toBe(false);

    const chunk2: StreamChunk = { type: "done", completed: true };
    expect(chunk2.completed).toBe(true);

    const chunk3: StreamChunk = { type: "done" };
    expect(chunk3.completed).toBeUndefined();
  });
});
