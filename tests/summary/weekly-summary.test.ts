import { describe, it, expect } from "vitest";
import { computeWeeklySummary } from "../../src/summary/weekly-summary";
import type { ActivitySession } from "../../src/db/index";

function msFor(dateStr: string, hour = 12): number {
  return Date.parse(`${dateStr}T${String(hour).padStart(2, "0")}:00:00.000Z`);
}

function makeSession(overrides: Partial<ActivitySession> & { id: string; startedAt: number }): ActivitySession {
  return {
    domain: "claude.ai",
    endedAt: overrides.startedAt + 60_000,
    durationMs: 60_000,
    activeMs: 50_000,
    metrics: { interaction_count: 0, copy_events: 0, paste_events: 0 },
    syncStatus: "local",
    createdAt: overrides.startedAt + 60_000,
    ...overrides,
  };
}

describe("computeWeeklySummary", () => {
  it("returns empty summary for no sessions", () => {
    const result = computeWeeklySummary([], "2024-01-01", "2024-01-07");
    expect(result).toEqual({
      startDate: "2024-01-01",
      endDate: "2024-01-07",
      totalSessions: 0,
      totalDurationMs: 0,
      totalActiveMs: 0,
      mostUsedTool: null,
      averageSessionMs: 0,
      dailySummaries: [],
    });
  });

  it("computes totals correctly", () => {
    const sessions = [
      makeSession({ id: "s1", startedAt: msFor("2024-01-01"), durationMs: 600_000, activeMs: 500_000 }),
      makeSession({ id: "s2", startedAt: msFor("2024-01-02"), durationMs: 1_200_000, activeMs: 900_000 }),
      makeSession({ id: "s3", startedAt: msFor("2024-01-03"), durationMs: 300_000, activeMs: 280_000 }),
    ];
    const result = computeWeeklySummary(sessions, "2024-01-01", "2024-01-07");

    expect(result.totalSessions).toBe(3);
    expect(result.totalDurationMs).toBe(2_100_000);
    expect(result.totalActiveMs).toBe(1_680_000);
    expect(result.averageSessionMs).toBe(700_000);
  });

  it("finds most-used tool by duration", () => {
    const sessions = [
      makeSession({ id: "s1", startedAt: msFor("2024-01-01"), domain: "claude.ai", durationMs: 600_000 }),
      makeSession({ id: "s2", startedAt: msFor("2024-01-01", 14), domain: "claude.ai", durationMs: 600_000 }),
      makeSession({ id: "s3", startedAt: msFor("2024-01-01", 16), domain: "chatgpt.com", durationMs: 300_000 }),
    ];
    const result = computeWeeklySummary(sessions, "2024-01-01", "2024-01-07");

    expect(result.mostUsedTool).toEqual({ name: "claude.ai", percentage: 80 });
  });

  it("mostUsedTool is null when totalDurationMs is zero (guard)", () => {
    // Edge: all sessions have durationMs = 0
    const sessions = [
      makeSession({ id: "s1", startedAt: msFor("2024-01-01"), durationMs: 0, activeMs: 0 }),
    ];
    const result = computeWeeklySummary(sessions, "2024-01-01", "2024-01-07");
    expect(result.mostUsedTool).toBeNull();
  });

  it("falls back to durationMs when activeMs is missing", () => {
    const session = makeSession({ id: "s1", startedAt: msFor("2024-01-01"), durationMs: 600_000 });
    delete (session as Partial<ActivitySession>).activeMs;

    const result = computeWeeklySummary([session], "2024-01-01", "2024-01-07");

    expect(result.totalActiveMs).toBe(600_000); // falls back to durationMs
  });

  it("groups sessions into daily summaries sorted by date descending", () => {
    const sessions = [
      makeSession({ id: "s1", startedAt: msFor("2024-01-01") }),
      makeSession({ id: "s2", startedAt: msFor("2024-01-03") }),
      makeSession({ id: "s3", startedAt: msFor("2024-01-02") }),
    ];
    const result = computeWeeklySummary(sessions, "2024-01-01", "2024-01-07");

    expect(result.dailySummaries).toHaveLength(3);
    expect(result.dailySummaries[0].date).toBe("2024-01-03");
    expect(result.dailySummaries[1].date).toBe("2024-01-02");
    expect(result.dailySummaries[2].date).toBe("2024-01-01");
  });

  it("computes daily totals correctly", () => {
    const sessions = [
      makeSession({ id: "s1", startedAt: msFor("2024-01-01"), durationMs: 600_000, activeMs: 500_000 }),
      makeSession({ id: "s2", startedAt: msFor("2024-01-01", 14), durationMs: 300_000, activeMs: 250_000 }),
    ];
    const result = computeWeeklySummary(sessions, "2024-01-01", "2024-01-07");

    expect(result.dailySummaries[0].totalDurationMs).toBe(900_000);
    expect(result.dailySummaries[0].totalActiveMs).toBe(750_000);
  });

  it("sorts sessions within a day by startedAt ascending", () => {
    const sessions = [
      makeSession({ id: "s1", startedAt: msFor("2024-01-01", 16) }),
      makeSession({ id: "s2", startedAt: msFor("2024-01-01", 8) }),
    ];
    const result = computeWeeklySummary(sessions, "2024-01-01", "2024-01-07");

    expect(result.dailySummaries[0].sessions[0].id).toBe("s2");
    expect(result.dailySummaries[0].sessions[1].id).toBe("s1");
  });

  it("handles single session with 100% for mostUsedTool", () => {
    const sessions = [
      makeSession({ id: "s1", startedAt: msFor("2024-01-01"), domain: "perplexity.ai", durationMs: 300_000 }),
    ];
    const result = computeWeeklySummary(sessions, "2024-01-01", "2024-01-07");

    expect(result.mostUsedTool).toEqual({ name: "perplexity.ai", percentage: 100 });
  });

  it("averageSessionMs rounds correctly", () => {
    const sessions = [
      makeSession({ id: "s1", startedAt: msFor("2024-01-01"), durationMs: 100_000 }),
      makeSession({ id: "s2", startedAt: msFor("2024-01-02"), durationMs: 200_000 }),
      makeSession({ id: "s3", startedAt: msFor("2024-01-03"), durationMs: 300_000 }),
    ];
    const result = computeWeeklySummary(sessions, "2024-01-01", "2024-01-07");

    // (100000 + 200000 + 300000) / 3 = 200000
    expect(result.averageSessionMs).toBe(200_000);
  });
});
