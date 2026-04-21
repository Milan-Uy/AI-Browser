import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { callAgent } from "../api-client";
import type { AgentMessage } from "../messaging";

describe("api-client.callAgent", () => {
  const origFetch = globalThis.fetch;
  beforeEach(() => {});
  afterEach(() => {
    globalThis.fetch = origFetch;
  });

  it("parses a well-formed AgentMessage response", async () => {
    const body: AgentMessage = {
      completed: false,
      explanation: "clicking button",
      steps: [{ stepNumber: 1, action: "click", id: 3, name: "Go" }],
    };
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }),
    );
    const got = await callAgent("http://x/agent", { userPrompt: "go" });
    expect(got).toEqual(body);
  });

  it("returns an error AgentMessage on non-2xx", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response("nope", { status: 500 }));
    const got = await callAgent("http://x/agent", { userPrompt: "x" });
    expect(got.completed).toBe(true);
    expect(got.error).toMatch(/HTTP 500/);
  });

  it("retries once on 5xx before failing", async () => {
    let calls = 0;
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      calls++;
      if (calls === 1) return new Response("", { status: 503 });
      return new Response(JSON.stringify({ completed: true, explanation: "ok" }), { status: 200 });
    });
    const got = await callAgent("http://x/agent", { userPrompt: "x" });
    expect(calls).toBe(2);
    expect(got.completed).toBe(true);
  });

  it("surfaces malformed-JSON as an error AgentMessage", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response("not-json", { status: 200 }));
    const got = await callAgent("http://x/agent", { userPrompt: "x" });
    expect(got.completed).toBe(true);
    expect(got.error).toBeDefined();
  });
});
