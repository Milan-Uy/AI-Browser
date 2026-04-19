import {
  isMessageOfKind,
  makeMessage,
  sendToTab,
  type AppMessage,
} from "@/lib/messaging";
import { streamChat } from "@/lib/api-client";

const BACKEND_URL = "http://localhost:8000/chat";

export default defineBackground(() => {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((err) => console.error("[bg] setPanelBehavior failed", err));

  // Long-lived port for streaming chat responses back to the side panel.
  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== "chat") return;
    let aborted = false;
    const controller = new AbortController();
    port.onDisconnect.addListener(() => {
      aborted = true;
      controller.abort();
    });

    port.onMessage.addListener(async (msg: AppMessage) => {
      if (!isMessageOfKind(msg, "CHAT_MESSAGE")) return;
      const requestId = Math.random().toString(36).slice(2);
      try {
        let page = null;
        if (msg.payload.includePage) {
          const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
          if (tab?.id) {
            const res = (await sendToTab(tab.id, "GET_PAGE_CONTENT", undefined)) as AppMessage | null;
            if (res && isMessageOfKind(res, "PAGE_CONTENT_RESULT")) {
              page = res.payload.content;
            }
          }
        }

        for await (const chunk of streamChat(
          BACKEND_URL,
          { message: msg.payload.text, page },
          controller.signal,
        )) {
          if (aborted) break;
          port.postMessage(makeMessage("STREAM_CHUNK", { requestId, chunk }));
          if (chunk.type === "done" || chunk.type === "error") break;
        }
      } catch (err) {
        if (!aborted) {
          port.postMessage(
            makeMessage("STREAM_CHUNK", {
              requestId,
              chunk: { type: "error", message: (err as Error).message },
            }),
          );
        }
      }
    });
  });

  // One-shot requests (page-content) keep the existing path.
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
