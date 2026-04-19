import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { streamChat } from "../api-client";
import type { StreamChunk } from "../messaging";

function sseBody(events: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(ctrl) {
      for (const ev of events) ctrl.enqueue(enc.encode(ev));
      ctrl.close();
    },
  });
}

describe("api-client.streamChat", () => {
  const origFetch = globalThis.fetch;
  beforeEach(() => {});
  afterEach(() => {
    globalThis.fetch = origFetch;
  });

  it("parses multiple SSE chunks", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        sseBody([
          'data: {"type":"text","content":"hi "}\n\n',
          'data: {"type":"text","content":"there"}\n\n',
          'data: {"type":"done"}\n\n',
        ]),
        { status: 200, headers: { "content-type": "text/event-stream" } },
      ),
    );
    const got: StreamChunk[] = [];
    for await (const c of streamChat("http://x/chat", { message: "hi", page: null })) {
      got.push(c);
    }
    expect(got).toEqual([
      { type: "text", content: "hi " },
      { type: "text", content: "there" },
      { type: "done" },
    ]);
  });

  it("handles events split across chunks", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        sseBody([
          'data: {"type":"text",',
          '"content":"split"}\n\n',
          'data: {"type":"done"}\n\n',
        ]),
        { status: 200 },
      ),
    );
    const got: StreamChunk[] = [];
    for await (const c of streamChat("http://x/chat", { message: "x", page: null })) {
      got.push(c);
    }
    expect(got[0]).toEqual({ type: "text", content: "split" });
    expect(got[1]).toEqual({ type: "done" });
  });

  it("emits an error chunk on non-2xx", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response("nope", { status: 500 }));
    const got: StreamChunk[] = [];
    for await (const c of streamChat("http://x/chat", { message: "x", page: null })) {
      got.push(c);
    }
    expect(got[0].type).toBe("error");
  });
});
