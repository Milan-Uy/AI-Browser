import { useCallback, useEffect, useRef, useState } from "react";
import { isMessageOfKind, makeMessage, type AppMessage } from "@/lib/messaging";
import type { ChatMessage } from "../components/MessageBubble";

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState(false);
  const portRef = useRef<chrome.runtime.Port | null>(null);
  const assistantIdRef = useRef<string | null>(null);

  useEffect(() => {
    const port = chrome.runtime.connect({ name: "chat" });
    portRef.current = port;

    port.onMessage.addListener((msg: AppMessage) => {
      if (!isMessageOfKind(msg, "STREAM_CHUNK")) return;
      const id = assistantIdRef.current;
      if (!id) return;
      const { chunk } = msg.payload;
      if (chunk.type === "text") {
        setMessages((prev) =>
          prev.map((m) => (m.id === id ? { ...m, content: m.content + chunk.content } : m)),
        );
      } else if (chunk.type === "error") {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === id ? { ...m, content: m.content + `\n[error] ${chunk.message}`, pending: false } : m,
          ),
        );
        setPending(false);
        assistantIdRef.current = null;
      } else if (chunk.type === "done") {
        setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, pending: false } : m)));
        setPending(false);
        assistantIdRef.current = null;
      }
    });

    return () => {
      port.disconnect();
      portRef.current = null;
    };
  }, []);

  const cancel = useCallback(() => {
    const id = assistantIdRef.current;
    if (id) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === id ? { ...m, content: m.content + "\n[cancelled locally]", pending: false } : m,
        ),
      );
    }
    assistantIdRef.current = null;
    setPending(false);
  }, []);

  const clear = useCallback(() => {
    setMessages([]);
    setPending(false);
    assistantIdRef.current = null;
  }, []);

  const send = useCallback(
    async (text: string, includePage: boolean) => {
      if (!text.trim() || pending || !portRef.current) return;
      const userMsg: ChatMessage = { id: uid(), role: "user", content: text };
      const assistantMsg: ChatMessage = { id: uid(), role: "assistant", content: "", pending: true };
      assistantIdRef.current = assistantMsg.id;
      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setPending(true);
      portRef.current.postMessage(makeMessage("CHAT_MESSAGE", { text, includePage }));
    },
    [pending],
  );

  return { messages, pending, send, cancel, clear };
}
