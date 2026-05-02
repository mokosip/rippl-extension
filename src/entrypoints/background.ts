import { getEnabledDomains, matchURL } from "@/domains/ai-domains";
import { SessionTracker } from "@/tracking/session-tracker";
import { updateBadge } from "@/badge/badge-manager";
import { db } from "@/db/index";
import { pruneOldSessions } from "@/db/queries";

export default defineBackground(() => {
  console.log("[rippl] service worker started");
  const tracker = new SessionTracker();
  const HEARTBEAT_ALARM = "rippl-heartbeat";
  const IDLE_THRESHOLD = 300; // 5 min

  // Handle session end: OS notification + optional toast
  tracker.onSessionEnd = async (session) => {
    const mins = Math.round(session.activeSeconds / 60);
    const duration = mins < 1 ? "<1 min" : `${mins} min`;

    // OS notification (always)
    try {
      await chrome.notifications.create(`rippl-${Date.now()}`, {
        type: "basic",
        iconUrl: chrome.runtime.getURL("icon/128.png"),
        title: `Tracked ${duration} on ${session.domain}`,
        message: "Click the rippl icon to log what you did.",
        priority: 0,
      });
      console.log("[rippl] notification sent");
    } catch (e) {
      console.error("[rippl] notification failed", e);
    }

    // Toast (if enabled) — inject directly via chrome.scripting
    const toastConfig = await db.config.get("toastEnabled");
    if (toastConfig?.value === true) {
      const popupUrl = chrome.runtime.getURL("/popup.html");
      const injectToast = async () => {
        const delays = [500, 1500, 3000];
        for (const delay of delays) {
          await new Promise(r => setTimeout(r, delay));
          try {
            const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
            const url = activeTab?.url ?? "";
            if (!activeTab?.id || !/^https?:\/\//.test(url)) {
              console.log("[rippl] toast skip (non-injectable)", url.slice(0, 50));
              continue;
            }
            await chrome.scripting.executeScript({
              target: { tabId: activeTab.id },
              func: (domain: string, dur: string) => {
                const host = document.createElement("div");
                const shadow = host.attachShadow({ mode: "closed" });
                shadow.innerHTML = `
                  <style>
                    :host { all: initial; position: fixed; bottom: 24px; right: 24px; z-index: 2147483647; }
                    .t { font-family: Inter,ui-sans-serif,system-ui,sans-serif; background: #EFEAE0; color: #1F1C16;
                         border: 1px solid #D8CFB9; border-left: 3px solid #5C7A52; border-radius: 8px;
                         padding: 10px 16px; font-size: 13px; font-weight: 500; line-height: 1.4;
                         box-shadow: 0 4px 12px rgba(0,0,0,.1); cursor: pointer; max-width: 280px;
                         opacity: 0; transform: translateY(8px); animation: ri .25s ease forwards; }
                    .t:hover { border-left-color: #3F5639; box-shadow: 0 4px 16px rgba(0,0,0,.15); }
                    .lb { color: #8C8478; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; margin-bottom: 2px; }
                    .ac { color: #5C7A52; font-size: 12px; font-weight: 500; margin-top: 4px; }
                    .t:hover .ac { color: #3F5639; }
                    .fo { animation: ro .3s ease forwards; }
                    @keyframes ri { to { opacity: 1; transform: translateY(0); } }
                    @keyframes ro { to { opacity: 0; transform: translateY(8px); } }
                  </style>
                  <div class="t">
                    <div class="lb">rippl</div>
                    <div>Tracked ${dur} on ${domain}</div>
                    <div class="ac">Log what you did →</div>
                  </div>`;
                document.body.appendChild(host);
                shadow.querySelector(".t")!.addEventListener("click", () => {
                  chrome.runtime.sendMessage({ type: "rippl-open-popup" });
                  host.remove();
                });
                setTimeout(() => {
                  const t = shadow.querySelector(".t");
                  if (t) { t.classList.add("fo"); t.addEventListener("animationend", () => host.remove()); }
                }, 7000);
              },
              args: [session.domain, duration],
            });
            console.log("[rippl] toast injected on", url.slice(0, 60));
            return;
          } catch (e) {
            console.log("[rippl] toast inject failed", (e as Error).message);
          }
        }
      };
      injectToast();
    }
  };

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
      const domains = await getEnabledDomains();
      const domain = tab.url ? matchURL(tab.url, domains) : null;
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

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "rippl-open-popup") {
      chrome.action.openPopup().catch(() => {});
    }
  });

  chrome.runtime.onInstalled.addListener(async (details) => {
    if (details.reason === "install") {
      await chrome.tabs.create({ url: chrome.runtime.getURL("/welcome.html") });
    }
  });

  pruneOldSessions();
});
