import { useCallback, useState } from "react";
import type { ChatMessage } from "../components/MessageBubble";
import type { PageContent } from "@/lib/messaging";

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState(false);

  const send = useCallback(
    async (text: string, page: PageContent | null) => {
      if (!text.trim() || pending) return;
      const userMsg: ChatMessage = { id: uid(), role: "user", content: text };
      const assistantMsg: ChatMessage = { id: uid(), role: "assistant", content: "", pending: true };
      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setPending(true);

      const suffix = page ? ` (saw ${page.elements.length} elements on "${page.title}")` : "";
      const reply = `Echo: ${text}${suffix}`;
      for (let i = 1; i <= reply.length; i++) {
        await new Promise((r) => setTimeout(r, 10));
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsg.id ? { ...m, content: reply.slice(0, i) } : m,
          ),
        );
      }
      setMessages((prev) =>
        prev.map((m) => (m.id === assistantMsg.id ? { ...m, pending: false } : m)),
      );
      setPending(false);
    },
    [pending],
  );

  return { messages, pending, send };
}
