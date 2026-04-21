import { useCallback, useEffect, useRef, useState } from "react";
import {
  isMessageOfKind,
  makeMessage,
  type AppMessage,
  type Step,
} from "@/lib/messaging";
import type { ChatMessage } from "../components/MessageBubble";

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export interface PendingStep {
  requestId: string;
  step: Step;
}

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState(false);
  const [pendingStep, setPendingStep] = useState<PendingStep | null>(null);
  const portRef = useRef<chrome.runtime.Port | null>(null);

  const addAssistant = useCallback((content: string) => {
    setMessages((prev) => [...prev, { id: uid(), role: "assistant", content }]);
  }, []);

  useEffect(() => {
    const port = chrome.runtime.connect({ name: "chat" });
    portRef.current = port;

    port.onMessage.addListener((msg: AppMessage) => {
      if (isMessageOfKind(msg, "CONFIRM_STEP")) {
        setPendingStep({ requestId: msg.payload.requestId, step: msg.payload.step });
        return;
      }
      if (!isMessageOfKind(msg, "AGENT_UPDATE")) return;
      const { update } = msg.payload;

      if (update.explanation) {
        addAssistant(`Turn ${update.turn}: ${update.explanation}`);
      }
      if (update.steps?.length) {
        const plan = update.steps
          .map((s) => `  ${s.stepNumber}. ${s.action}${s.name ? ` "${s.name}"` : ""}${s.value ? ` = "${s.value}"` : ""}`)
          .join("\n");
        addAssistant(`Planned steps:\n${plan}`);
      }
      if (update.stepResults?.length) {
        const lines = update.stepResults
          .map((r) => `  ${r.stepNumber}: ${r.success ? "✓" : "✗"}${r.error ? ` (${r.error})` : ""}`)
          .join("\n");
        addAssistant(`Batch result:\n${lines}`);
      }
      if (update.error) {
        addAssistant(`[error] ${update.error}`);
      }
      if (update.status === "completed" || update.status === "error") {
        setPending(false);
        setPendingStep(null);
      }
    });

    return () => {
      port.disconnect();
      portRef.current = null;
    };
  }, [addAssistant]);

  const decideStep = useCallback((requestId: string, approved: boolean) => {
    setPendingStep(null);
    portRef.current?.postMessage(makeMessage("STEP_APPROVED", { requestId, approved }));
  }, []);

  const cancel = useCallback(() => {
    addAssistant("[cancelled locally]");
    setPending(false);
    setPendingStep(null);
  }, [addAssistant]);

  const send = useCallback(
    async (text: string, includePage: boolean) => {
      if (!text.trim() || pending || !portRef.current) return;
      setMessages((prev) => [...prev, { id: uid(), role: "user", content: text }]);
      setPending(true);
      portRef.current.postMessage(makeMessage("CHAT_MESSAGE", { text, includePage }));
    },
    [pending],
  );

  return { messages, pending, pendingStep, send, decideStep, cancel };
}
