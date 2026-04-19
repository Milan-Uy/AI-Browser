import { extractPageContent } from "@/lib/page-extractor";
import { isMessageOfKind, makeMessage, type AppMessage } from "@/lib/messaging";

export default defineContentScript({
  matches: ["<all_urls>"],
  runAt: "document_idle",
  main() {
    chrome.runtime.onMessage.addListener(
      (msg: AppMessage, _sender, sendResponse) => {
        if (isMessageOfKind(msg, "GET_PAGE_CONTENT")) {
          try {
            const content = extractPageContent();
            sendResponse(makeMessage("PAGE_CONTENT_RESULT", { content }));
          } catch (err) {
            console.error("[cs] extract failed", err);
            sendResponse(null);
          }
          return true; // async response
        }
        return false;
      },
    );
  },
});
