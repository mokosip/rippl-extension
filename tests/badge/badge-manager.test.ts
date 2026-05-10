import { describe, it, expect, afterEach, vi } from "vitest";
import { updateBadge } from "../../src/badge/badge-manager";

describe("updateBadge", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("clears badge when paused=true regardless of tracking state", async () => {
    await updateBadge(true, true);
    expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: "" });
    expect(chrome.action.setBadgeBackgroundColor).not.toHaveBeenCalled();
  });

  it("clears badge when paused=false and not tracking", async () => {
    await updateBadge(false, false);
    expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: "" });
    expect(chrome.action.setBadgeBackgroundColor).not.toHaveBeenCalled();
  });

  it("shows active-session indicator when not paused and tracking", async () => {
    await updateBadge(false, true);
    expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: "●" });
    expect(chrome.action.setBadgeBackgroundColor).toHaveBeenCalledWith({ color: "#5C7A52" });
  });

  it("clears badge with default isTracking=false (no second arg)", async () => {
    await updateBadge(false);
    expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: "" });
    expect(chrome.action.setBadgeBackgroundColor).not.toHaveBeenCalled();
  });
});
