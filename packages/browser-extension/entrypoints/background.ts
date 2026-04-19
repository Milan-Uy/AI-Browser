import {
  isMessageOfKind,
  makeMessage,
  sendToTab,
  type AppMessage,
} from "@/lib/messaging";

export default defineBackground(() => {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((err) => console.error("[bg] setPanelBehavior failed", err));

  chrome.runtime.onMessage.addListener(
    (msg: AppMessage, _sender, sendResponse) => {
      if (isMessageOfKind(msg, "GET_PAGE_CONTENT")) {
        (async () => {
          const [tab] = await chrome.tabs.query({
            active: true,
            lastFocusedWindow: true,
          });
          if (!tab?.id) {
            sendResponse(null);
            return;
          }
          try {
            const res = (await sendToTab(tab.id, "GET_PAGE_CONTENT", undefined)) as AppMessage | null;
            if (res && isMessageOfKind(res, "PAGE_CONTENT_RESULT")) {
              sendResponse(makeMessage("PAGE_CONTENT_RESULT", res.payload));
            } else {
              sendResponse(null);
            }
          } catch (err) {
            console.error("[bg] forwarding GET_PAGE_CONTENT failed", err);
            sendResponse(null);
          }
        })();
        return true; // async
      }
      return false;
    },
  );
});
