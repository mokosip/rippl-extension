import { db } from "../db/index";

let bannerClearTimer: ReturnType<typeof setTimeout> | null = null;

export async function showExtensionBanner(
  text: string,
  color: string,
  ttlMs = 5000,
): Promise<void> {
  await chrome.action.setBadgeText({ text });
  await chrome.action.setBadgeBackgroundColor({ color });

  if (bannerClearTimer) clearTimeout(bannerClearTimer);

  bannerClearTimer = setTimeout(() => {
    chrome.action.setBadgeText({ text: "" });
  }, ttlMs);
}

export async function updateBadge(paused: boolean): Promise<void> {
  if (paused) {
    await chrome.action.setBadgeText({ text: "" });
    return;
  }

  const now = Date.now();
  const unlogged = await db.sessions
    .filter(s => !s.logged && s.badgeExpiry !== null && s.badgeExpiry > now)
    .count();

  if (unlogged > 0) {
    await chrome.action.setBadgeText({ text: String(unlogged) });
    await chrome.action.setBadgeBackgroundColor({ color: "#B05F3F" }); // --terra
  } else {
    await chrome.action.setBadgeText({ text: "" });
  }
}
