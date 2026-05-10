import { describe, expect, it } from "vitest";
import type { ActivitySession } from "../../src/db/index";
import { computeTodaySummary, formatDuration } from "../../src/entrypoints/popup/view-model";

function makeSession(overrides: Partial<ActivitySession> & { id: string; startedAt: number }): ActivitySession {
  return {
    id: overrides.id,
    domain: overrides.domain ?? "example.com",
    startedAt: overrides.startedAt,
    endedAt: overrides.endedAt ?? overrides.startedAt + 60_000,
    durationMs: overrides.durationMs ?? 60_000,
    activeMs: overrides.activeMs,
    metrics: overrides.metrics ?? {
      interaction_count: 0,
      copy_events: 0,
      paste_events: 0,
    },
    syncStatus: overrides.syncStatus ?? "pending",
    createdAt: overrides.createdAt ?? overrides.startedAt,
  };
}

describe("formatDuration", () => {
  it("formats durations below one minute", () => {
    expect(formatDuration(0)).toBe("< 1 min");
    expect(formatDuration(59_000)).toBe("< 1 min");
  });

  it("formats minute values below one hour", () => {
    expect(formatDuration(60_000)).toBe("1 min");
    expect(formatDuration(90_000)).toBe("1 min");
  });

  it("formats durations at or above one hour", () => {
    expect(formatDuration(3_600_000)).toBe("1hr 0min");
  });
});

describe("computeTodaySummary", () => {
  it("returns zero summary for empty input", () => {
    expect(computeTodaySummary([], "2026-05-09")).toEqual({
      sessionCount: 0,
      totalDurationMs: 0,
      totalActiveMs: 0,
    });
  });

  it("filters by date and sums duration and active time", () => {
    const sessions: ActivitySession[] = [
      makeSession({
        id: "s-1",
        startedAt: Date.parse("2026-05-09T08:00:00.000Z"),
        durationMs: 10 * 60_000,
        activeMs: 6 * 60_000,
      }),
      makeSession({
        id: "s-2",
        startedAt: Date.parse("2026-05-09T10:00:00.000Z"),
        durationMs: 30 * 60_000,
        activeMs: 12 * 60_000,
      }),
      makeSession({
        id: "s-3",
        startedAt: Date.parse("2026-05-08T10:00:00.000Z"),
        durationMs: 50 * 60_000,
        activeMs: 20 * 60_000,
      }),
    ];

    expect(computeTodaySummary(sessions, "2026-05-09")).toEqual({
      sessionCount: 2,
      totalDurationMs: 40 * 60_000,
      totalActiveMs: 18 * 60_000,
    });
  });

  it("falls back to duration when activeMs missing", () => {
    const sessions: ActivitySession[] = [
      makeSession({
        id: "s-1",
        startedAt: Date.parse("2026-05-09T08:00:00.000Z"),
        durationMs: 10 * 60_000,
      }),
      makeSession({
        id: "s-2",
        startedAt: Date.parse("2026-05-09T10:00:00.000Z"),
        durationMs: 5 * 60_000,
        activeMs: 2 * 60_000,
      }),
    ];

    expect(computeTodaySummary(sessions, "2026-05-09")).toEqual({
      sessionCount: 2,
      totalDurationMs: 15 * 60_000,
      totalActiveMs: 12 * 60_000,
    });
  });
});
