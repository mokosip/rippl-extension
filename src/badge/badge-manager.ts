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

/**
 * Updates the extension badge.
 * Shows an active-session indicator (green ●) when tracking is live,
 * clears when paused or no session is active.
 */
export async function updateBadge(paused: boolean, isTracking = false): Promise<void> {
  if (paused || !isTracking) {
    await chrome.action.setBadgeText({ text: "" });
    return;
  }
  await chrome.action.setBadgeText({ text: "●" });
  await chrome.action.setBadgeBackgroundColor({ color: "#5C7A52" }); // --fern
}
