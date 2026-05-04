import { describe, it, expect, afterEach } from "vitest";
import { db } from "../../src/db/index";

afterEach(async () => {
  await db.config.clear();
});

describe("customActivities config", () => {
  it("stores and retrieves custom activities as string array", async () => {
    await db.config.put({ key: "customActivities", value: ["Data analysis", "Debugging"] });

    const config = await db.config.get("customActivities");
    expect(config?.value).toEqual(["Data analysis", "Debugging"]);
  });

  it("returns undefined when no custom activities configured", async () => {
    const config = await db.config.get("customActivities");
    expect(config).toBeUndefined();
  });

  it("overwrites previous custom activities on put", async () => {
    await db.config.put({ key: "customActivities", value: ["A", "B"] });
    await db.config.put({ key: "customActivities", value: ["C"] });

    const config = await db.config.get("customActivities");
    expect(config?.value).toEqual(["C"]);
  });

  it("stores empty array", async () => {
    await db.config.put({ key: "customActivities", value: [] });

    const config = await db.config.get("customActivities");
    expect(config?.value).toEqual([]);
  });
});
