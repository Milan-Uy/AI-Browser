export default defineBackground(() => {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((err) => console.error("[bg] setPanelBehavior failed", err));

  chrome.runtime.onInstalled.addListener(() => {
    console.log("[bg] AI Browser Agent installed");
  });
});
