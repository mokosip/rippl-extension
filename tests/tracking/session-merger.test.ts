import { describe, it, expect } from "vitest";
import { mergeAndFilterSessions } from "../../src/tracking/session-merger";
import type { Session } from "../../src/db/index";

function makeSession(overrides: Partial<Session> & { domain: string; startedAt: number; endedAt: number; activeSeconds: number }): Session {
  return {
    id: `session-${overrides.startedAt}`,
    date: "2026-05-02",
    activityType: null,
    estimatedWithoutMinutes: null,
    timeSavedMinutes: null,
    logged: false,
    badgeExpiry: null,
    ...overrides,
  };
}

// Timestamps in milliseconds
const T0 = 1_000_000_000_000; // base timestamp

describe("mergeAndFilterSessions", () => {
  it("returns empty array for empty input", () => {
    expect(mergeAndFilterSessions([])).toEqual([]);
  });

  it("filters out micro-sessions under 10 seconds", () => {
    const sessions = [
      makeSession({ domain: "example.com", startedAt: T0, endedAt: T0 + 9_000, activeSeconds: 9 }),
      makeSession({ domain: "example.com", startedAt: T0 + 20_000, endedAt: T0 + 30_000, activeSeconds: 10 }),
    ];
    const result = mergeAndFilterSessions(sessions);
    expect(result).toHaveLength(1);
    expect(result[0].activeSeconds).toBe(10);
  });

  it("keeps a session with exactly 10 seconds (boundary)", () => {
    const sessions = [
      makeSession({ domain: "example.com", startedAt: T0, endedAt: T0 + 10_000, activeSeconds: 10 }),
    ];
    const result = mergeAndFilterSessions(sessions);
    expect(result).toHaveLength(1);
  });

  it("keeps a single valid session unchanged", () => {
    const session = makeSession({ domain: "example.com", startedAt: T0, endedAt: T0 + 60_000, activeSeconds: 60 });
    const result = mergeAndFilterSessions([session]);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(session);
  });

  it("merges two sessions on same domain within 2-minute gap", () => {
    const s1 = makeSession({ domain: "example.com", startedAt: T0, endedAt: T0 + 60_000, activeSeconds: 60 });
    const s2 = makeSession({ domain: "example.com", startedAt: T0 + 100_000, endedAt: T0 + 160_000, activeSeconds: 60 });
    // gap = (T0+100_000 - T0+60_000) / 1000 = 40 seconds — within 2 minutes
    const result = mergeAndFilterSessions([s1, s2]);
    expect(result).toHaveLength(1);
    expect(result[0].startedAt).toBe(T0);
    expect(result[0].endedAt).toBe(T0 + 160_000);
    expect(result[0].activeSeconds).toBe(120);
  });

  it("merges sessions when gap is exactly 120 seconds (boundary)", () => {
    const s1 = makeSession({ domain: "example.com", startedAt: T0, endedAt: T0 + 60_000, activeSeconds: 60 });
    const s2 = makeSession({ domain: "example.com", startedAt: T0 + 180_000, endedAt: T0 + 240_000, activeSeconds: 60 });
    // gap = (T0+180_000 - T0+60_000) / 1000 = 120 seconds — exactly at limit
    const result = mergeAndFilterSessions([s1, s2]);
    expect(result).toHaveLength(1);
    expect(result[0].activeSeconds).toBe(120);
  });

  it("does NOT merge sessions with gap > 2 minutes", () => {
    const s1 = makeSession({ domain: "example.com", startedAt: T0, endedAt: T0 + 60_000, activeSeconds: 60 });
    const s2 = makeSession({ domain: "example.com", startedAt: T0 + 181_000, endedAt: T0 + 241_000, activeSeconds: 60 });
    // gap = 121 seconds — exceeds 2-minute limit
    const result = mergeAndFilterSessions([s1, s2]);
    expect(result).toHaveLength(2);
  });

  it("does NOT merge sessions on different domains", () => {
    const s1 = makeSession({ domain: "example.com", startedAt: T0, endedAt: T0 + 60_000, activeSeconds: 60 });
    const s2 = makeSession({ domain: "other.com", startedAt: T0 + 30_000, endedAt: T0 + 90_000, activeSeconds: 60 });
    const result = mergeAndFilterSessions([s1, s2]);
    expect(result).toHaveLength(2);
  });

  it("uses earliest startedAt and latest endedAt when merging", () => {
    const s1 = makeSession({ domain: "example.com", startedAt: T0 + 50_000, endedAt: T0 + 110_000, activeSeconds: 60 });
    const s2 = makeSession({ domain: "example.com", startedAt: T0, endedAt: T0 + 60_000, activeSeconds: 60 });
    // s2 starts earlier, s1 ends later — after sort s2 comes first
    const result = mergeAndFilterSessions([s1, s2]);
    expect(result).toHaveLength(1);
    expect(result[0].startedAt).toBe(T0);
    expect(result[0].endedAt).toBe(T0 + 110_000);
    expect(result[0].activeSeconds).toBe(120);
  });

  it("does not merge same-domain sessions separated by a different-domain session in the sorted order", () => {
    // Sequential merge: a.com, b.com, a.com — b.com interrupts the a.com chain
    const sessions = [
      makeSession({ domain: "a.com", startedAt: T0, endedAt: T0 + 60_000, activeSeconds: 60 }),
      makeSession({ domain: "b.com", startedAt: T0 + 10_000, endedAt: T0 + 70_000, activeSeconds: 60 }),
      makeSession({ domain: "a.com", startedAt: T0 + 90_000, endedAt: T0 + 150_000, activeSeconds: 60 }),
    ];
    // Sort order: a.com(T0), b.com(T0+10k), a.com(T0+90k)
    // a.com(T0) vs b.com(T0+10k): different domain → push
    // b.com(T0+10k) vs a.com(T0+90k): different domain → push
    // Result: 3 sessions (no merges)
    const result = mergeAndFilterSessions(sessions);
    expect(result).toHaveLength(3);
  });

  it("merges consecutive same-domain sessions not interrupted by another domain", () => {
    const sessions = [
      makeSession({ domain: "a.com", startedAt: T0, endedAt: T0 + 60_000, activeSeconds: 60 }),
      makeSession({ domain: "a.com", startedAt: T0 + 90_000, endedAt: T0 + 150_000, activeSeconds: 60 }),
      makeSession({ domain: "b.com", startedAt: T0 + 200_000, endedAt: T0 + 260_000, activeSeconds: 60 }),
    ];
    // Sort: a.com(T0), a.com(T0+90k) — gap 30s → merge; then b.com
    const result = mergeAndFilterSessions(sessions);
    const aSessions = result.filter(s => s.domain === "a.com");
    const bSessions = result.filter(s => s.domain === "b.com");
    expect(aSessions).toHaveLength(1);
    expect(aSessions[0].activeSeconds).toBe(120);
    expect(bSessions).toHaveLength(1);
  });

  it("filters all sessions when all are micro-sessions", () => {
    const sessions = [
      makeSession({ domain: "example.com", startedAt: T0, endedAt: T0 + 5_000, activeSeconds: 5 }),
      makeSession({ domain: "example.com", startedAt: T0 + 10_000, endedAt: T0 + 18_000, activeSeconds: 8 }),
    ];
    expect(mergeAndFilterSessions(sessions)).toEqual([]);
  });
});
