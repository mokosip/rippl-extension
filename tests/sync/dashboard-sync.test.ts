import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db, type ActivitySession } from "../../src/db/index";
import { FEEDBACK_QUEUE_EXPIRY_MS } from "../../src/feedback/feedback-queue";
import { submitSessionFeedback, syncSessions } from "../../src/sync/dashboard-sync";

function makeActivitySession(overrides: Partial<ActivitySession> = {}): ActivitySession {
  return {
    id: "sess-1",
    domain: "claude.ai",
    startedAt: 1_000,
    endedAt: 5_000,
    durationMs: 4_000,
    activeMs: 3_500,
    metrics: {
      interaction_count: 3,
      copy_events: 1,
      paste_events: 2,
    },
    syncStatus: "pending",
    createdAt: 5_000,
    ...overrides,
  };
}

describe("dashboard sync v1 ingestion", () => {
  beforeEach(async () => {
    await db.activitySessions.clear();
    await db.feedbackQueue.clear();
    await db.config.clear();
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it.each([200, 201])("posts to /api/ext/v1/activity-sessions and marks synced on %i", async status => {
    await db.config.put({ key: "dashboardToken", value: "token-123" });
    await db.activitySessions.put(makeActivitySession());

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ feedback_request: { ask: false } }), {
        status,
        headers: { "Content-Type": "application/json" },
      })
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await syncSessions();

    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://me.ripplup.app/api/ext/v1/activity-sessions");
    expect(init.method).toBe("POST");

    const body = JSON.parse(String(init.body));
    expect(body.session).toEqual({ id: "sess-1", started_at: 1_000, ended_at: 5_000 });
    expect(body.metrics).toMatchObject({
      interaction_count: 3,
      copy_events: 1,
      paste_events: 2,
      duration_ms: 4_000,
      active_ms: 3_500,
    });

    const saved = await db.activitySessions.get("sess-1");
    expect(saved?.syncStatus).toBe("synced");
  });

  it("clears token and marks unsynced sessions local on 401", async () => {
    await db.config.put({ key: "dashboardToken", value: "token-123" });
    await db.activitySessions.put(makeActivitySession());

    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await syncSessions();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(await db.config.get("dashboardToken")).toBeUndefined();
    expect((await db.activitySessions.get("sess-1"))?.syncStatus).toBe("local");
  });

  it("queues feedback when ingestion response has complete ask payload", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_778_320_800_000);

    await db.config.put({ key: "dashboardToken", value: "token-123" });
    await db.activitySessions.put(makeActivitySession());

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          session_id: "d067f5c4-e7bd-4fb5-94f6-7887548994ac",
          feedback_request: {
            ask: true,
            question: "What were you working on?",
            options: [
              { label: "Coding", value: "coding" },
              { label: "Review", value: "review" },
            ],
          },
        }),
        {
          status: 201,
          headers: { "Content-Type": "application/json" },
        }
      )
    );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    await syncSessions();

    const queued = await db.feedbackQueue.toArray();
    expect(queued).toHaveLength(1);
    expect(queued[0]).toMatchObject({
      sessionId: "d067f5c4-e7bd-4fb5-94f6-7887548994ac",
      question: "What were you working on?",
      status: "pending",
      options: [
        { label: "Coding", value: "coding" },
        { label: "Review", value: "review" },
      ],
    });
    expect(queued[0].expiresAt - queued[0].createdAt).toBe(FEEDBACK_QUEUE_EXPIRY_MS);
  });
});

describe("dashboard sync feedback submit", () => {
  beforeEach(async () => {
    await db.activitySessions.clear();
    await db.feedbackQueue.clear();
    await db.config.clear();
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("submits feedback with default task_type payload", async () => {
    await db.config.put({ key: "dashboardToken", value: "token-123" });

    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const ok = await submitSessionFeedback("a45b9ec8-4dbe-4843-b44b-f838177fcfbe", "coding");

    expect(ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "https://me.ripplup.app/api/ext/v1/activity-sessions/a45b9ec8-4dbe-4843-b44b-f838177fcfbe/feedback"
    );
    expect(init.method).toBe("POST");

    const body = JSON.parse(String(init.body));
    expect(body).toEqual({ type: "task_type", value: "coding" });
  });

  it("treats 404 feedback response as handled", async () => {
    await db.config.put({ key: "dashboardToken", value: "token-123" });

    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const ok = await submitSessionFeedback("missing-session", "coding");

    expect(ok).toBe(true);
    expect(await db.config.get("dashboardToken")).toMatchObject({
      key: "dashboardToken",
      value: "token-123",
    });
  });
});
