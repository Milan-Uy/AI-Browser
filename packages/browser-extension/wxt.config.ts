import { defineConfig } from "wxt";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  manifest: {
    name: "AI Browser Agent",
    description: "Chat with an AI that can read and control the current page.",
    permissions: ["sidePanel", "tabs", "activeTab", "scripting", "storage"],
    host_permissions: ["http://localhost:8000/*", "http://*/*", "https://*/*"],
    action: {
      default_title: "Open AI side panel",
    },
    side_panel: {
      default_path: "sidepanel.html",
    },
    web_accessible_resources: [],
  },
});
