import type { PageContent, StreamChunk } from "./messaging";

export interface ChatRequest {
  message: string;
  page: PageContent | null;
}

export async function* streamChat(
  endpoint: string,
  req: ChatRequest,
  signal?: AbortSignal,
): AsyncGenerator<StreamChunk, void, void> {
  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(req),
      signal,
    });
  } catch (err) {
    yield { type: "error", message: `fetch failed: ${(err as Error).message}` };
    return;
  }

  if (!res.ok || !res.body) {
    yield { type: "error", message: `HTTP ${res.status}` };
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });

    let sep: number;
    while ((sep = buf.indexOf("\n\n")) !== -1) {
      const raw = buf.slice(0, sep);
      buf = buf.slice(sep + 2);
      const chunk = parseSseEvent(raw);
      if (chunk) yield chunk;
    }
  }
  buf += decoder.decode();
  if (buf.trim()) {
    const chunk = parseSseEvent(buf);
    if (chunk) yield chunk;
  }
}

function parseSseEvent(block: string): StreamChunk | null {
  const lines = block.split("\n");
  const data = lines
    .filter((l) => l.startsWith("data:"))
    .map((l) => l.slice(5).trim())
    .join("");
  if (!data) return null;
  try {
    const parsed = JSON.parse(data) as StreamChunk;
    return parsed;
  } catch {
    return { type: "error", message: `bad SSE payload: ${data.slice(0, 120)}` };
  }
}
