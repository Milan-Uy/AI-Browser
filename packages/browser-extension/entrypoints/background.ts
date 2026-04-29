import {
  isMessageOfKind,
  makeMessage,
  sendToTab,
  type AppMessage,
  type TurnActionRecord,
  type TurnRecord,
} from "@/lib/messaging";
import { streamChat } from "@/lib/api-client";
import { validateAction, createRateLimiter } from "@/lib/security";

const BACKEND_URL = "http://localhost:8000/chat";
const MAX_TURNS = 10;

export default defineBackground(() => {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((err) => console.error("[bg] setPanelBehavior failed", err));

  const rateLimiter = createRateLimiter(500);

  chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== "chat") return;
    const controller = new AbortController();
    let aborted = false;

    port.onDisconnect.addListener(() => {
      aborted = true;
      controller.abort();
    });

    port.onMessage.addListener(async (msg: AppMessage) => {
      if (!isMessageOfKind(msg, "CHAT_MESSAGE")) return;

      const requestId = Math.random().toString(36).slice(2);
      if (aborted) return;

      const history: TurnRecord[] = [];

      for (let turn = 0; turn < MAX_TURNS; turn++) {
        if (aborted) break;

        let page = null;
        if (msg.payload.includePage) {
          const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
          if (tab?.id) {
            const res = (await sendToTab(tab.id, "GET_PAGE_CONTENT", undefined)) as AppMessage | null;
            if (res && isMessageOfKind(res, "PAGE_CONTENT_RESULT")) page = res.payload.content;
          }
        }

        console.groupCollapsed(`[agent] turn ${turn} → backend`);
        console.log({ message: msg.payload.text, page, history });
        console.groupEnd();

        const turnActions: TurnActionRecord[] = [];
        let completed = false;

        try {
          for await (const chunk of streamChat(
            BACKEND_URL,
            { message: msg.payload.text, page, history },
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
              await rateLimiter.acquire();
              const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
              if (!tab?.id) continue;
              const actionId = `${requestId}-${Math.random().toString(36).slice(2, 8)}`;
              const res = (await sendToTab(tab.id, "EXECUTE_ACTION", {
                requestId: actionId,
                action: chunk.action,
              })) as AppMessage | null;
              const result =
                res && isMessageOfKind(res, "EXECUTE_ACTION_RESULT")
                  ? res.payload.result
                  : { ok: false, message: "no result" };
              const ok = result.ok;
              port.postMessage(
                makeMessage("STREAM_CHUNK", {
                  requestId,
                  chunk: {
                    type: "text",
                    content: ok
                      ? `\n[action executed ✓]\n`
                      : `\n[action failed: ${result.message ?? "unknown"}]\n`,
                  },
                }),
              );
              turnActions.push({ action: chunk.action, result });
            } else if (chunk.type === "done") {
              completed = chunk.completed ?? true;
              break;
            } else if (chunk.type === "error") {
              port.postMessage(makeMessage("STREAM_CHUNK", { requestId, chunk }));
              completed = true;
              break;
            } else {
              port.postMessage(makeMessage("STREAM_CHUNK", { requestId, chunk }));
            }
          }
        } catch (err) {
          port.postMessage(
            makeMessage("STREAM_CHUNK", {
              requestId,
              chunk: { type: "error", message: (err as Error).message },
            }),
          );
          break;
        }

        history.push({ actions: turnActions, page });

        if (completed || turnActions.length === 0) break;
      }

      port.postMessage(
        makeMessage("STREAM_CHUNK", {
          requestId,
          chunk: { type: "done", completed: true },
        }),
      );
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
