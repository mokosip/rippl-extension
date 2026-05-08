import { describe, it, expect, vi, afterEach } from "vitest";
import { showExtensionBanner } from "../../src/badge/badge-manager";

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("showExtensionBanner", () => {
  it("sets badge text/color immediately", async () => {
    vi.useFakeTimers();

    await showExtensionBanner("✓", "#5C7A52", 5000);

    expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: "✓" });
    expect(chrome.action.setBadgeBackgroundColor).toHaveBeenCalledWith({ color: "#5C7A52" });
  });

  it("clears badge text after ttl", async () => {
    vi.useFakeTimers();

    await showExtensionBanner("!", "#B05F3F", 1000);

    await vi.advanceTimersByTimeAsync(1000);

    expect(chrome.action.setBadgeText).toHaveBeenLastCalledWith({ text: "" });
  });
});
