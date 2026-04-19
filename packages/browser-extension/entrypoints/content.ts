import { extractPageContent } from "@/lib/page-extractor";
import { executeAction } from "@/lib/dom-actions";
import { isMessageOfKind, makeMessage, type AppMessage } from "@/lib/messaging";

export default defineContentScript({
  matches: ["<all_urls>"],
  runAt: "document_idle",
  main() {
    chrome.runtime.onMessage.addListener((msg: AppMessage, _sender, sendResponse) => {
      if (isMessageOfKind(msg, "GET_PAGE_CONTENT")) {
        try {
          sendResponse(makeMessage("PAGE_CONTENT_RESULT", { content: extractPageContent() }));
        } catch (err) {
          console.error("[cs] extract failed", err);
          sendResponse(null);
        }
        return true;
      }
      if (isMessageOfKind(msg, "EXECUTE_ACTION")) {
        (async () => {
          try {
            const result = await executeAction(msg.payload.action);
            sendResponse(
              makeMessage("EXECUTE_ACTION_RESULT", { requestId: msg.payload.requestId, result }),
            );
          } catch (err) {
            sendResponse(
              makeMessage("EXECUTE_ACTION_RESULT", {
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
