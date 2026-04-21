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
  let res: Response | null = null;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
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
      if (attempt === 1) {
        yield { type: "error", message: `fetch failed: ${(err as Error).message}` };
        return;
      }
      await new Promise((r) => setTimeout(r, 250));
    }
  }

  if (!res || !res.ok || !res.body) {
    yield { type: "error", message: `HTTP ${res?.status ?? "unknown"}` };
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");

    let sep: number;
    while ((sep = buf.indexOf("\n\n")) !== -1) {
      const raw = buf.slice(0, sep);
      buf = buf.slice(sep + 2);
      const chunk = parseSseEvent(raw);
      if (chunk) yield chunk;
    }
  }
  buf += decoder.decode().replace(/\r\n/g, "\n");
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
    .join("\n");
  if (!data) return null;
  try {
    const parsed = JSON.parse(data) as StreamChunk;
    return parsed;
  } catch {
    return { type: "error", message: `bad SSE payload: ${data.slice(0, 120)}` };
  }
}
