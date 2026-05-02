import { db } from "../db/index";

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
