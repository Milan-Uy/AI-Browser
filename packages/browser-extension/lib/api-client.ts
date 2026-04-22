import type { AgentMessage, MessageToAgent } from "./messaging";

export async function callAgent(
  endpoint: string,
  req: MessageToAgent,
  signal?: AbortSignal,
): Promise<AgentMessage> {
  let res: Response | null = null;
  let lastErr: unknown = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      if (attempt === 0) {
        console.log("[callAgent] sending request to", endpoint, req);
      }
      res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(req),
        signal,
      });
      if (res.ok) break;
      if (res.status < 500 || attempt === 1) break;
      await new Promise((r) => setTimeout(r, 250));
    } catch (err) {
      lastErr = err;
      if (attempt === 1) {
        return { completed: true, error: `fetch failed: ${(err as Error).message}` };
      }
      await new Promise((r) => setTimeout(r, 250));
    }
  }

  if (!res) {
    return { completed: true, error: `fetch failed: ${(lastErr as Error)?.message ?? "unknown"}` };
  }
  if (!res.ok) {
    return { completed: true, error: `HTTP ${res.status}` };
  }

  try {
    const data = (await res.json()) as AgentMessage;
    if (typeof data !== "object" || data === null || typeof data.completed !== "boolean") {
      return { completed: true, error: "malformed AgentMessage" };
    }
    return data;
  } catch (err) {
    return { completed: true, error: `bad JSON: ${(err as Error).message}` };
  }
}
