import { extractPageState } from "@/lib/page-extractor";
import { executeStep } from "@/lib/dom-actions";
import { isMessageOfKind, makeMessage, type AppMessage } from "@/lib/messaging";

export default defineContentScript({
  matches: ["<all_urls>"],
  runAt: "document_idle",
  main() {
    let currentIdMap = new Map<number, HTMLElement>();

    chrome.runtime.onMessage.addListener((msg: AppMessage, _sender, sendResponse) => {
      if (isMessageOfKind(msg, "GET_PAGE_STATE")) {
        try {
          const { pageState, idMap } = extractPageState();
          currentIdMap = idMap;
          sendResponse(makeMessage("PAGE_STATE_RESULT", { state: pageState }));
        } catch (err) {
          console.error("[cs] extract failed", err);
          sendResponse(makeMessage("PAGE_STATE_RESULT", { state: null }));
        }
        return true;
      }
      if (isMessageOfKind(msg, "EXECUTE_STEP")) {
        (async () => {
          try {
            const result = await executeStep(msg.payload.step, currentIdMap);
            sendResponse(
              makeMessage("EXECUTE_STEP_RESULT", { requestId: msg.payload.requestId, result }),
            );
          } catch (err) {
            sendResponse(
              makeMessage("EXECUTE_STEP_RESULT", {
                requestId: msg.payload.requestId,
                result: { ok: false, message: (err as Error).message },
              }),
            );
          }
        })();
        return true;
      }
      return false;
    });
  },
});
