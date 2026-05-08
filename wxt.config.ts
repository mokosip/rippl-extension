import { defineConfig } from "wxt";

export default defineConfig({
  srcDir: "src",
  manifest: {
    name: "rippl — See your AI life",
    version: "0.1.0",
    description: "Tracks time spent on AI tools and shows how AI shapes your day. All data stays local.",
    permissions: ["tabs", "storage", "idle", "alarms", "notifications", "scripting"],
    host_permissions: [
      "https://chatgpt.com/*",
      "https://*.chatgpt.com/*",
      "https://chat.openai.com/*",
      "https://claude.ai/*",
      "https://*.claude.ai/*",
      "https://gemini.google.com/*",
      "https://copilot.microsoft.com/*",
      "https://perplexity.ai/*",
      "https://*.perplexity.ai/*",
      "https://midjourney.com/*",
      "https://*.midjourney.com/*",
      "https://poe.com/*",
      "https://*.poe.com/*",
      "https://huggingface.co/chat*",
      "https://you.com/*",
      "https://*.you.com/*",
      "https://github.com/copilot*",
      "https://me.ripplup.app/*",
      "http://localhost/*",
      "https://localhost/*",
      "http://127.0.0.1/*",
      "https://127.0.0.1/*",
    ],
    optional_host_permissions: ["<all_urls>"],
    externally_connectable: {
      matches: ["https://me.ripplup.app/*", "http://localhost/*"],
    },
  },
});
