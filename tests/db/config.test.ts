import { describe, it, expect, afterEach } from "vitest";
import { db } from "../../src/db/index";

afterEach(async () => {
  await db.config.clear();
});

describe("config table", () => {
  it("stores and retrieves trackingPaused", async () => {
    await db.config.put({ key: "trackingPaused", value: true });

    const config = await db.config.get("trackingPaused");
    expect(config?.value).toBe(true);
  });

  it("returns undefined when key not set", async () => {
    const config = await db.config.get("trackingPaused");
    expect(config).toBeUndefined();
  });

  it("overwrites previous value on put", async () => {
    await db.config.put({ key: "trackingPaused", value: true });
    await db.config.put({ key: "trackingPaused", value: false });

    const config = await db.config.get("trackingPaused");
    expect(config?.value).toBe(false);
  });

  it("stores and retrieves enabledDomains as array", async () => {
    const domains = [{ hostname: "claude.ai", label: "Claude" }];
    await db.config.put({ key: "enabledDomains", value: domains });

    const config = await db.config.get("enabledDomains");
    expect(config?.value).toEqual(domains);
  });

  it("stores and retrieves toastEnabled flag", async () => {
    await db.config.put({ key: "toastEnabled", value: true });

    const config = await db.config.get("toastEnabled");
    expect(config?.value).toBe(true);
  });
});
