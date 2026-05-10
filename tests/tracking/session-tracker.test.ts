import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { db } from "../../src/db/index";
import { SessionTracker } from "../../src/tracking/session-tracker";

beforeEach(async () => {
  await db.activitySessions.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("SessionTracker", () => {
  it("stores durationMs and metrics defaults on session end", async () => {
    const tracker = new SessionTracker();
    const startTime = 1_000_000_000_000;
    const endTime = startTime + 30_000;

    vi.spyOn(Date, "now").mockReturnValue(startTime);
    await tracker.onTabFocused("claude.ai");

    vi.spyOn(Date, "now").mockReturnValue(endTime);
    await tracker.onTabFocused(null);

    const sessions = await db.activitySessions.toArray();
    expect(sessions).toHaveLength(1);

    const saved = sessions[0];
    expect(saved.domain).toBe("claude.ai");
    expect(saved.startedAt).toBe(startTime);
    expect(saved.endedAt).toBe(endTime);
    expect(saved.durationMs).toBe(30_000);
    expect(saved.activeMs).toBe(30_000);
    expect(saved.metrics).toEqual({ interaction_count: 0, copy_events: 0, paste_events: 0 });
    expect(saved.syncStatus).toBe("pending");
    expect(saved.createdAt).toBe(endTime);
  });

  it("does not start a session for null domain", async () => {
    const tracker = new SessionTracker();
    await tracker.onTabFocused(null);
    expect(tracker.getActiveSession()).toBeNull();
  });

  it("ends session when switching to non-AI tab", async () => {
    const tracker = new SessionTracker();
    const startTime = 1_000_000_000_000;

    vi.spyOn(Date, "now").mockReturnValue(startTime);
    await tracker.onTabFocused("claude.ai");

    vi.spyOn(Date, "now").mockReturnValue(startTime + 20_000);
    await tracker.onTabFocused(null);

    expect(tracker.getActiveSession()).toBeNull();
    const sessions = await db.activitySessions.toArray();
    expect(sessions).toHaveLength(1);
  });

  it("switches domain and closes previous session", async () => {
    const tracker = new SessionTracker();
    const startTime = 1_000_000_000_000;

    vi.spyOn(Date, "now").mockReturnValue(startTime);
    await tracker.onTabFocused("claude.ai");

    vi.spyOn(Date, "now").mockReturnValue(startTime + 15_000);
    await tracker.onTabFocused("chatgpt.com");

    expect(tracker.getActiveSession()?.domain).toBe("chatgpt.com");

    const sessions = await db.activitySessions.toArray();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].domain).toBe("claude.ai");
  });

  it("onIdle ends current session", async () => {
    const tracker = new SessionTracker();
    const startTime = 1_000_000_000_000;

    vi.spyOn(Date, "now").mockReturnValue(startTime);
    await tracker.onTabFocused("claude.ai");

    vi.spyOn(Date, "now").mockReturnValue(startTime + 20_000);
    await tracker.onIdle();

    expect(tracker.getActiveSession()).toBeNull();
    const sessions = await db.activitySessions.toArray();
    expect(sessions).toHaveLength(1);
  });

  it("discards micro-sessions under 10 seconds", async () => {
    const tracker = new SessionTracker();
    const startTime = 1_000_000_000_000;

    vi.spyOn(Date, "now").mockReturnValue(startTime);
    await tracker.onTabFocused("claude.ai");

    vi.spyOn(Date, "now").mockReturnValue(startTime + 9_000);
    await tracker.onTabFocused(null);

    const sessions = await db.activitySessions.toArray();
    expect(sessions).toHaveLength(0);
  });

  it("saves session with exactly 10 seconds", async () => {
    const tracker = new SessionTracker();
    const startTime = 1_000_000_000_000;

    vi.spyOn(Date, "now").mockReturnValue(startTime);
    await tracker.onTabFocused("claude.ai");

    vi.spyOn(Date, "now").mockReturnValue(startTime + 10_000);
    await tracker.onTabFocused(null);

    const sessions = await db.activitySessions.toArray();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].durationMs).toBe(10_000);
  });

  it("onHeartbeat updates lastSeenAt", async () => {
    const tracker = new SessionTracker();
    const startTime = 1_000_000_000_000;
    const heartbeatTime = startTime + 5_000;

    vi.spyOn(Date, "now").mockReturnValue(startTime);
    await tracker.onTabFocused("claude.ai");
    expect(tracker.getActiveSession()?.lastSeenAt).toBe(startTime);

    vi.spyOn(Date, "now").mockReturnValue(heartbeatTime);
    tracker.onHeartbeat();

    expect(tracker.getActiveSession()?.lastSeenAt).toBe(heartbeatTime);
  });

  it("onSignalDelta merges metrics and activity", async () => {
    const tracker = new SessionTracker();
    const startTime = 1_000_000_000_000;

    vi.spyOn(Date, "now").mockReturnValue(startTime);
    await tracker.onTabFocused("claude.ai");

    tracker.onSignalDelta({
      interaction_count: 2,
      copy_events: 1,
      paste_events: 3,
      activityTs: startTime + 1_000,
    });

    tracker.onSignalDelta({
      interaction_count: 4,
      copy_events: 0,
      paste_events: 2,
      activityTs: startTime + 80_000,
    });

    vi.spyOn(Date, "now").mockReturnValue(startTime + 140_000);
    await tracker.onTabFocused(null);

    const sessions = await db.activitySessions.toArray();
    expect(sessions).toHaveLength(1);

    const saved = sessions[0];
    expect(saved.metrics).toEqual({ interaction_count: 6, copy_events: 1, paste_events: 5 });
    expect(saved.durationMs).toBe(140_000);
    expect(saved.activeMs).toBe(121_000);
  });

  it("onSignalDelta is no-op with no active session", async () => {
    const tracker = new SessionTracker();

    expect(() => tracker.onSignalDelta({ interaction_count: 1, activityTs: Date.now() })).not.toThrow();
    expect(await db.activitySessions.toArray()).toHaveLength(0);
  });

  it("does not end session when focusing same domain", async () => {
    const tracker = new SessionTracker();
    const startTime = 1_000_000_000_000;

    vi.spyOn(Date, "now").mockReturnValue(startTime);
    await tracker.onTabFocused("claude.ai");
    const session1 = tracker.getActiveSession();

    vi.spyOn(Date, "now").mockReturnValue(startTime + 5_000);
    await tracker.onTabFocused("claude.ai");
    const session2 = tracker.getActiveSession();

    expect(session1?.id).toBe(session2?.id);
    expect(await db.activitySessions.toArray()).toHaveLength(0);
  });
});
