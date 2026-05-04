import { describe, it, expect } from "vitest";
import { computeWeeklySummary } from "../../src/summary/weekly-summary";
import type { Session } from "../../src/db/index";

const baseSession = (overrides: Partial<Session> & { id: string; date: string }): Session => ({
  domain: "Claude",
  startedAt: 1000,
  endedAt: 2000,
  activeSeconds: 600,
  activityType: null,
  estimatedWithoutMinutes: null,
  timeSavedMinutes: null,
  logged: false,
  badgeExpiry: null,
  ...overrides,
});

describe("computeWeeklySummary", () => {
  it("returns empty summary for no sessions", () => {
    const result = computeWeeklySummary([], "2024-01-01", "2024-01-07");
    expect(result).toEqual({
      startDate: "2024-01-01",
      endDate: "2024-01-07",
      totalSessions: 0,
      loggedSessions: 0,
      totalActiveMinutes: 0,
      totalTimeSavedMinutes: 0,
      mostUsedTool: null,
      topActivity: null,
      averageSessionMinutes: 0,
      dailySummaries: [],
    });
  });

  it("computes totals correctly", () => {
    const sessions = [
      baseSession({ id: "s1", date: "2024-01-01", activeSeconds: 600, logged: true, timeSavedMinutes: 10 }),
      baseSession({ id: "s2", date: "2024-01-02", activeSeconds: 1200, logged: true, timeSavedMinutes: 20 }),
      baseSession({ id: "s3", date: "2024-01-03", activeSeconds: 300, logged: false }),
    ];
    const result = computeWeeklySummary(sessions, "2024-01-01", "2024-01-07");

    expect(result.totalSessions).toBe(3);
    expect(result.loggedSessions).toBe(2);
    expect(result.totalActiveMinutes).toBe(35);
    expect(result.totalTimeSavedMinutes).toBe(30);
  });

  it("finds most-used tool by active time percentage", () => {
    const sessions = [
      baseSession({ id: "s1", date: "2024-01-01", domain: "Claude", activeSeconds: 600 }),
      baseSession({ id: "s2", date: "2024-01-01", domain: "Claude", activeSeconds: 600 }),
      baseSession({ id: "s3", date: "2024-01-01", domain: "ChatGPT", activeSeconds: 300 }),
    ];
    const result = computeWeeklySummary(sessions, "2024-01-01", "2024-01-07");

    expect(result.mostUsedTool).toEqual({ name: "Claude", percentage: 80 });
  });

  it("computes topActivity when >=50% sessions logged", () => {
    const sessions = [
      baseSession({ id: "s1", date: "2024-01-01", logged: true, activityType: ["Code"] }),
      baseSession({ id: "s2", date: "2024-01-01", logged: true, activityType: ["Code"] }),
      baseSession({ id: "s3", date: "2024-01-01", logged: true, activityType: ["Writing"] }),
      baseSession({ id: "s4", date: "2024-01-01", logged: false }),
    ];
    const result = computeWeeklySummary(sessions, "2024-01-01", "2024-01-07");

    expect(result.topActivity).toEqual({ name: "Code", percentage: 67 });
  });

  it("returns null topActivity when <50% sessions logged", () => {
    const sessions = [
      baseSession({ id: "s1", date: "2024-01-01", logged: true, activityType: ["Code"] }),
      baseSession({ id: "s2", date: "2024-01-01", logged: false }),
      baseSession({ id: "s3", date: "2024-01-01", logged: false }),
    ];
    const result = computeWeeklySummary(sessions, "2024-01-01", "2024-01-07");

    expect(result.topActivity).toBeNull();
    expect(result.averageSessionMinutes).toBe(10);
  });

  it("returns null topActivity when all logged sessions have no activityType", () => {
    const sessions = [
      baseSession({ id: "s1", date: "2024-01-01", logged: true, activityType: null }),
      baseSession({ id: "s2", date: "2024-01-01", logged: true, activityType: null }),
    ];
    const result = computeWeeklySummary(sessions, "2024-01-01", "2024-01-07");

    expect(result.topActivity).toBeNull();
  });

  it("groups sessions into daily summaries sorted by date descending", () => {
    const sessions = [
      baseSession({ id: "s1", date: "2024-01-01", startedAt: 1000 }),
      baseSession({ id: "s2", date: "2024-01-03", startedAt: 3000 }),
      baseSession({ id: "s3", date: "2024-01-02", startedAt: 2000 }),
    ];
    const result = computeWeeklySummary(sessions, "2024-01-01", "2024-01-07");

    expect(result.dailySummaries).toHaveLength(3);
    expect(result.dailySummaries[0].date).toBe("2024-01-03");
    expect(result.dailySummaries[1].date).toBe("2024-01-02");
    expect(result.dailySummaries[2].date).toBe("2024-01-01");
  });

  it("computes daily totals correctly", () => {
    const sessions = [
      baseSession({ id: "s1", date: "2024-01-01", activeSeconds: 600, logged: true, timeSavedMinutes: 10 }),
      baseSession({ id: "s2", date: "2024-01-01", activeSeconds: 300, logged: true, timeSavedMinutes: 5 }),
    ];
    const result = computeWeeklySummary(sessions, "2024-01-01", "2024-01-07");

    expect(result.dailySummaries[0].totalActiveMinutes).toBe(15);
    expect(result.dailySummaries[0].totalTimeSavedMinutes).toBe(15);
  });

  it("sorts sessions within a day by startedAt ascending", () => {
    const sessions = [
      baseSession({ id: "s1", date: "2024-01-01", startedAt: 3000 }),
      baseSession({ id: "s2", date: "2024-01-01", startedAt: 1000 }),
    ];
    const result = computeWeeklySummary(sessions, "2024-01-01", "2024-01-07");

    expect(result.dailySummaries[0].sessions[0].id).toBe("s2");
    expect(result.dailySummaries[0].sessions[1].id).toBe("s1");
  });

  it("handles single session with 100% for tool and activity", () => {
    const sessions = [
      baseSession({ id: "s1", date: "2024-01-01", domain: "Perplexity", logged: true, activityType: ["Research"] }),
    ];
    const result = computeWeeklySummary(sessions, "2024-01-01", "2024-01-07");

    expect(result.mostUsedTool).toEqual({ name: "Perplexity", percentage: 100 });
    expect(result.topActivity).toEqual({ name: "Research", percentage: 100 });
  });

  it("only counts timeSavedMinutes from logged sessions with non-null values", () => {
    const sessions = [
      baseSession({ id: "s1", date: "2024-01-01", logged: true, timeSavedMinutes: 20 }),
      baseSession({ id: "s2", date: "2024-01-01", logged: true, timeSavedMinutes: null }),
      baseSession({ id: "s3", date: "2024-01-01", logged: false, timeSavedMinutes: 30 }),
    ];
    const result = computeWeeklySummary(sessions, "2024-01-01", "2024-01-07");

    expect(result.totalTimeSavedMinutes).toBe(20);
  });
});
