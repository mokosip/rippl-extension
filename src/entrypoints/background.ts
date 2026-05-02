import { matchAIDomain } from "@/domains/ai-domains";
import { SessionTracker } from "@/tracking/session-tracker";
import { updateBadge } from "@/badge/badge-manager";
import { db } from "@/db/index";
import { pruneOldSessions } from "@/db/queries";

export default defineBackground(() => {
  console.log("[rippl] service worker started");
  const tracker = new SessionTracker();
  const HEARTBEAT_ALARM = "rippl-heartbeat";
  const IDLE_THRESHOLD = 300; // 5 min

  async function isPaused(): Promise<boolean> {
    const config = await db.config.get("trackingPaused");
    return config?.value === true;
  }

  async function handleTabChange(tabId: number) {
    const paused = await isPaused();
    if (paused) {
      await tracker.onTabFocused(null);
      await chrome.alarms.clear(HEARTBEAT_ALARM);
      return;
    }

    try {
      const tab = await chrome.tabs.get(tabId);
      const customDomains = await db.customDomains.toArray();
      const domain = tab.url ? matchAIDomain(tab.url, customDomains) : null;
      console.log("[rippl] tab →", tab.url?.slice(0, 60), domain ? `✓ ${domain}` : "✗ not AI");
      await tracker.onTabFocused(domain);

      if (domain) {
        await chrome.alarms.create(HEARTBEAT_ALARM, { periodInMinutes: 1 });
      } else {
        await chrome.alarms.clear(HEARTBEAT_ALARM);
      }

      await updateBadge(paused);
    } catch {
      await tracker.onTabFocused(null);
      await chrome.alarms.clear(HEARTBEAT_ALARM);
    }
  }

  chrome.tabs.onActivated.addListener(async (activeInfo) => {
    await handleTabChange(activeInfo.tabId);
  });

  chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    if (changeInfo.status === "complete" && tab.active) {
      await handleTabChange(tabId);
    }
  });

  chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === HEARTBEAT_ALARM) {
      tracker.onHeartbeat();
      const active = tracker.getActiveSession();
      if (active) {
        const secs = Math.round((Date.now() - active.startedAt) / 1000);
        console.log("[rippl] ♥ heartbeat", active.domain, `${secs}s`);
      }
    }
  });

  chrome.idle.setDetectionInterval(IDLE_THRESHOLD);

  chrome.idle.onStateChanged.addListener(async (newState) => {
    console.log("[rippl] idle state →", newState);
    if (newState === "idle" || newState === "locked") {
      await tracker.onIdle();
      await chrome.alarms.clear(HEARTBEAT_ALARM);
      const paused = await isPaused();
      await updateBadge(paused);
    } else if (newState === "active") {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (activeTab?.id) await handleTabChange(activeTab.id);
    }
  });

  chrome.runtime.onInstalled.addListener(async (details) => {
    if (details.reason === "install") {
      await chrome.tabs.create({ url: chrome.runtime.getURL("/welcome.html") });
    }
  });

  pruneOldSessions();
});
