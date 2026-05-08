import { getEnabledDomains, matchURL } from "@/domains/ai-domains";
import { SessionTracker } from "@/tracking/session-tracker";
import type { InteractionUpdateMessage } from "@/tracking/signal-types";
import { updateBadge } from "@/badge/badge-manager";
import { db } from "@/db/index";
import { pruneOldSessions } from "@/db/queries";
import { setAuthToken, syncSessions, setupPeriodicSync, handleSyncAlarm } from "@/sync/dashboard-sync";

export default defineBackground(() => {
  console.log("[rippl] service worker started");
  const tracker = new SessionTracker();
  const HEARTBEAT_ALARM = "rippl-heartbeat";
  const IDLE_THRESHOLD = 300; // 5 min
  const SIGNAL_FLUSH_INTERVAL_MS = 5000;
  const RESET_SIGNAL_COUNTERS_MESSAGE_TYPE = "rippl-reset-interaction-counters";
  let activeTrackedTabId: number | null = null;

  async function injectSignalCollector(tabId: number): Promise<void> {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        func: (flushIntervalMs: number, resetMessageType: string) => {
          const key = "__rippl_signal_installed__";
          const scope = globalThis as typeof globalThis & Record<string, unknown>;
          if (scope[key]) return;
          scope[key] = true;

          let interactionCount = 0;
          let copyEvents = 0;
          let pasteEvents = 0;
          let lastActivity = Date.now();
          let lastFlushedActivity = lastActivity;

          const resetCounters = () => {
            interactionCount = 0;
            copyEvents = 0;
            pasteEvents = 0;
            lastActivity = Date.now();
            lastFlushedActivity = lastActivity;
          };

          const flush = () => {
            if (
              interactionCount === 0 &&
              copyEvents === 0 &&
              pasteEvents === 0 &&
              lastActivity === lastFlushedActivity
            ) {
              return;
            }

            chrome.runtime
              .sendMessage({
                type: "interaction-update",
                counts: {
                  interaction_count: interactionCount,
                  copy_events: copyEvents,
                  paste_events: pasteEvents,
                  activityTs: lastActivity,
                },
              })
              .catch(() => {});

            interactionCount = 0;
            copyEvents = 0;
            pasteEvents = 0;
            lastFlushedActivity = lastActivity;
          };

          const markActivity = () => {
            lastActivity = Date.now();
          };

          const onInteraction = () => {
            interactionCount += 1;
            markActivity();
          };

          const onCopy = () => {
            copyEvents += 1;
            markActivity();
          };

          const onPaste = () => {
            pasteEvents += 1;
            markActivity();
          };

          chrome.runtime.onMessage.addListener((msg: unknown) => {
            if ((msg as { type?: string })?.type !== resetMessageType) return;
            resetCounters();
          });

          document.addEventListener("click", onInteraction, true);
          document.addEventListener("keydown", onInteraction, true);
          document.addEventListener("copy", onCopy, true);
          document.addEventListener("paste", onPaste, true);
          document.addEventListener("mousemove", markActivity, { capture: true, passive: true });
          document.addEventListener("scroll", markActivity, { capture: true, passive: true });
          document.addEventListener(
            "visibilitychange",
            () => {
              if (document.visibilityState === "hidden") flush();
            },
            true
          );
          window.addEventListener("beforeunload", flush, true);

          setInterval(flush, flushIntervalMs);
        },
        args: [SIGNAL_FLUSH_INTERVAL_MS, RESET_SIGNAL_COUNTERS_MESSAGE_TYPE],
      });
    } catch (e) {
      console.warn("[rippl] signal collector inject failed", (e as Error).message);
    }
  }

  async function resetSignalCollector(tabId: number): Promise<void> {
    try {
      await chrome.tabs.sendMessage(tabId, { type: RESET_SIGNAL_COUNTERS_MESSAGE_TYPE });
    } catch {
      // no-op: tab might not have collector yet
    }
  }

  // Handle session end: OS notification + optional toast
  tracker.onSessionEnd = async (session) => {
    const trackedMs = typeof session.activeMs === "number" ? session.activeMs : session.durationMs;
    const mins = Math.round(trackedMs / 60_000);
    const duration = mins < 1 ? "<1 min" : `${mins} min`;

    // OS notification (always)
    try {
      await chrome.notifications.create(`rippl-${Date.now()}`, {
        type: "basic",
        iconUrl: chrome.runtime.getURL("icon/128.png"),
        title: `Tracked ${duration} on ${session.domain}`,
        message: "Click rippl icon to log what you did.",
        priority: 0,
      });
      console.log("[rippl] notification sent");
    } catch (e) {
      console.error("[rippl] notification failed", e);
    }

    // Toast (if enabled) — inject directly via chrome.scripting
    const toastConfig = await db.config.get("toastEnabled");
    if (toastConfig?.value === true) {
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
      if (activeTrackedTabId !== null) {
        await resetSignalCollector(activeTrackedTabId);
      }
      activeTrackedTabId = null;
      await tracker.onTabFocused(null);
      await chrome.alarms.clear(HEARTBEAT_ALARM);
      return;
    }

    try {
      const tab = await chrome.tabs.get(tabId);
      const domains = await getEnabledDomains();
      const domain = tab.url ? matchURL(tab.url, domains) : null;
      console.log("[rippl] tab →", tab.url?.slice(0, 60), domain ? `✓ ${domain}` : "✗ not AI");

      const previousSessionId = tracker.getActiveSession()?.id ?? null;
      await tracker.onTabFocused(domain);
      const currentSessionId = tracker.getActiveSession()?.id ?? null;
      const startedNewSession = Boolean(domain && currentSessionId && currentSessionId !== previousSessionId);

      if (domain) {
        await injectSignalCollector(tabId);
        if (startedNewSession) {
          await resetSignalCollector(tabId);
        }
        activeTrackedTabId = tabId;
        await chrome.alarms.create(HEARTBEAT_ALARM, { periodInMinutes: 1 });
      } else {
        activeTrackedTabId = null;
        await chrome.alarms.clear(HEARTBEAT_ALARM);
      }

      await updateBadge(paused);
    } catch {
      activeTrackedTabId = null;
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

  chrome.tabs.onRemoved.addListener((tabId) => {
    if (tabId === activeTrackedTabId) activeTrackedTabId = null;
  });

  chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (handleSyncAlarm(alarm.name)) return;
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
      const tabIdToReset = activeTrackedTabId;
      activeTrackedTabId = null;
      if (tabIdToReset !== null) {
        await resetSignalCollector(tabIdToReset);
      }
      await tracker.onIdle();
      await chrome.alarms.clear(HEARTBEAT_ALARM);
      const paused = await isPaused();
      await updateBadge(paused);
    } else if (newState === "active") {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (activeTab?.id) await handleTabChange(activeTab.id);
    }
  });

  chrome.runtime.onMessage.addListener((msg: unknown, sender) => {
    if ((msg as { type?: string })?.type === "rippl-open-popup") {
      chrome.action.openPopup().catch(() => {});
      return;
    }

    if ((msg as { type?: string })?.type !== "interaction-update") return;
    if (!sender.tab?.id || sender.tab.id !== activeTrackedTabId) return;

    const { counts } = msg as InteractionUpdateMessage;
    if (!counts) return;

    tracker.onSignalDelta({
      interaction_count: typeof counts.interaction_count === "number" ? counts.interaction_count : 0,
      copy_events: typeof counts.copy_events === "number" ? counts.copy_events : 0,
      paste_events: typeof counts.paste_events === "number" ? counts.paste_events : 0,
      activityTs: typeof counts.activityTs === "number" ? counts.activityTs : undefined,
    });
  });

  chrome.runtime.onMessageExternal.addListener(async (msg, sender, sendResponse) => {
    if (msg?.type === "rippl-auth" && typeof msg.token === "string") {
      console.log("[rippl] received dashboard token from", sender.url);
      await setAuthToken(msg.token);
      await syncSessions();
      sendResponse({ ok: true });
    }
  });

  chrome.runtime.onInstalled.addListener(async (details) => {
    if (details.reason === "install") {
      await chrome.tabs.create({ url: chrome.runtime.getURL("/welcome.html") });
    }
  });

  pruneOldSessions();
  setupPeriodicSync();
});
