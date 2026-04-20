import {
  isMessageOfKind,
  makeMessage,
  sendToTab,
  type AppMessage,
  type LLMAction,
} from "@/lib/messaging";
import { streamChat } from "@/lib/api-client";
import { validateAction, createRateLimiter } from "@/lib/security";

const BACKEND_URL = "http://localhost:8000/chat";

type Pending = {
  resolve: (approved: boolean) => void;
};

export default defineBackground(() => {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((err) => console.error("[bg] setPanelBehavior failed", err));

  const rateLimiter = createRateLimiter(500);

  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== "chat") return;
    const controller = new AbortController();
    const pending = new Map<string, Pending>();
    let aborted = false;

    port.onDisconnect.addListener(() => {
      aborted = true;
      controller.abort();
      for (const p of pending.values()) p.resolve(false);
      pending.clear();
    });

    const waitForApproval = (requestId: string, action: LLMAction) =>
      new Promise<boolean>((resolve) => {
        pending.set(requestId, { resolve });
        port.postMessage(makeMessage("CONFIRM_ACTION", { requestId, action }));
      });

    port.onMessage.addListener(async (msg: AppMessage) => {
      if (isMessageOfKind(msg, "ACTION_APPROVED")) {
        const p = pending.get(msg.payload.requestId);
        if (p) {
          pending.delete(msg.payload.requestId);
          p.resolve(msg.payload.approved);
        }
        return;
      }
      if (!isMessageOfKind(msg, "CHAT_MESSAGE")) return;

      const requestId = Math.random().toString(36).slice(2);
      let page = null;
      if (msg.payload.includePage) {
        const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        if (tab?.id) {
          const res = (await sendToTab(tab.id, "GET_PAGE_CONTENT", undefined)) as AppMessage | null;
          if (res && isMessageOfKind(res, "PAGE_CONTENT_RESULT")) page = res.payload.content;
        }
      }

      try {
        for await (const chunk of streamChat(
          BACKEND_URL,
          { message: msg.payload.text, page },
          controller.signal,
        )) {
          if (aborted) break;
          if (chunk.type === "action") {
            const validation = validateAction(chunk.action);
            if (!validation.ok) {
              port.postMessage(
                makeMessage("STREAM_CHUNK", {
                  requestId,
                  chunk: { type: "text", content: `\n[action rejected by policy: ${validation.message}]\n` },
                }),
              );
              continue;
            }
            if (!(await rateLimiter.acquire())) {
              port.postMessage(
                makeMessage("STREAM_CHUNK", {
                  requestId,
                  chunk: { type: "text", content: "\n[rate limited — wait before next action]\n" },
                }),
              );
              continue;
            }
            const actionId = `${requestId}-${Math.random().toString(36).slice(2, 8)}`;
            const approved = await waitForApproval(actionId, chunk.action);
            if (!approved) {
              port.postMessage(
                makeMessage("STREAM_CHUNK", {
                  requestId,
                  chunk: { type: "text", content: "\n[action denied by user]\n" },
                }),
              );
              continue;
            }
            const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
            if (!tab?.id) continue;
            const res = (await sendToTab(tab.id, "EXECUTE_ACTION", {
              requestId: actionId,
              action: chunk.action,
            })) as AppMessage | null;
            const ok =
              res && isMessageOfKind(res, "EXECUTE_ACTION_RESULT") && res.payload.result.ok;
            port.postMessage(
              makeMessage("STREAM_CHUNK", {
                requestId,
                chunk: {
                  type: "text",
                  content: ok
                    ? "\n[action executed ✓]\n"
                    : `\n[action failed: ${
                        (res && isMessageOfKind(res, "EXECUTE_ACTION_RESULT") && res.payload.result.message) ||
                        "unknown"
                      }]\n`,
                },
              }),
            );
          } else {
            port.postMessage(makeMessage("STREAM_CHUNK", { requestId, chunk }));
            if (chunk.type === "done" || chunk.type === "error") break;
          }
        }
      } catch (err) {
        port.postMessage(
          makeMessage("STREAM_CHUNK", {
            requestId,
            chunk: { type: "error", message: (err as Error).message },
          }),
        );
      }
    });
  });

  chrome.runtime.onMessage.addListener((msg: AppMessage, _sender, sendResponse) => {
    if (isMessageOfKind(msg, "GET_PAGE_CONTENT")) {
      (async () => {
        const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        if (!tab?.id) return sendResponse(null);
        try {
          const res = (await sendToTab(tab.id, "GET_PAGE_CONTENT", undefined)) as AppMessage | null;
          if (res && isMessageOfKind(res, "PAGE_CONTENT_RESULT")) {
            sendResponse(makeMessage("PAGE_CONTENT_RESULT", res.payload));
          } else sendResponse(null);
        } catch (err) {
          console.error("[bg] page-content failed", err);
          sendResponse(null);
        }
      })();
      return true;
    }
    return false;
  });
});
