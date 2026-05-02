import { defineConfig } from "wxt";

export default defineConfig({
  srcDir: "src",
  manifest: {
    name: "rippl — See your AI life",
    version: "0.1.0",
    description: "Tracks time spent on AI tools and shows how AI shapes your day. All data stays local.",
    permissions: ["tabs", "storage", "idle", "alarms"],
    host_permissions: [],
  },
});
