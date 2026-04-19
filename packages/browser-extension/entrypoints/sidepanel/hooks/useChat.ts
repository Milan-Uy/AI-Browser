import { useCallback, useEffect, useRef, useState } from "react";
import { isMessageOfKind, makeMessage, type AppMessage, type LLMAction } from "@/lib/messaging";
import type { ChatMessage } from "../components/MessageBubble";

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export interface PendingAction {
  requestId: string;
  action: LLMAction;
}

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const portRef = useRef<chrome.runtime.Port | null>(null);
  const assistantIdRef = useRef<string | null>(null);

  useEffect(() => {
    const port = chrome.runtime.connect({ name: "chat" });
    portRef.current = port;

    port.onMessage.addListener((msg: AppMessage) => {
      if (isMessageOfKind(msg, "CONFIRM_ACTION")) {
        setPendingAction({ requestId: msg.payload.requestId, action: msg.payload.action });
        return;
      }
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

  const decideAction = useCallback((requestId: string, approved: boolean) => {
    setPendingAction(null);
    portRef.current?.postMessage(makeMessage("ACTION_APPROVED", { requestId, approved }));
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
    setPendingAction(null);
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

  return { messages, pending, pendingAction, send, decideAction, cancel };
}
