import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../../src/db/index";
import {
  FEEDBACK_QUEUE_EXPIRY_MS,
  expirePendingFeedback,
  getNextPendingFeedback,
  markFeedbackAnswered,
  queueFeedback,
} from "../../src/feedback/feedback-queue";

describe("feedback queue helpers", () => {
  beforeEach(async () => {
    await db.feedbackQueue.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("inserts pending feedback item with default 24h expiry", async () => {
    vi.spyOn(Date, "now").mockReturnValue(1_767_225_600_000);

    const queued = await queueFeedback({
      sessionId: "sess-1",
      question: "What were you doing?",
      options: [{ label: "Coding", value: "coding" }],
    });

    const saved = await db.feedbackQueue.get(queued.id);

    expect(saved).toMatchObject({
      sessionId: "sess-1",
      question: "What were you doing?",
      status: "pending",
      createdAt: Date.now(),
    });
    expect(saved?.expiresAt).toBe(1_767_225_600_000 + FEEDBACK_QUEUE_EXPIRY_MS);
  });

  it("gets next pending item in FIFO order and auto-expires stale pending items", async () => {
    await queueFeedback({
      id: "q1",
      sessionId: "sess-1",
      question: "Expired",
      options: [{ label: "A", value: "a" }],
      createdAt: 100,
      expiresAt: 150,
    });
    await queueFeedback({
      id: "q2",
      sessionId: "sess-2",
      question: "First active",
      options: [{ label: "B", value: "b" }],
      createdAt: 110,
      expiresAt: 500,
    });
    await queueFeedback({
      id: "q3",
      sessionId: "sess-3",
      question: "Second active",
      options: [{ label: "C", value: "c" }],
      createdAt: 120,
      expiresAt: 500,
    });

    const next = await getNextPendingFeedback(200);

    expect(next?.id).toBe("q2");
    expect((await db.feedbackQueue.get("q1"))?.status).toBe("expired");
  });

  it("marks pending item as answered", async () => {
    const queued = await queueFeedback({
      id: "q1",
      sessionId: "sess-1",
      question: "Question",
      options: [{ label: "A", value: "a" }],
      createdAt: 100,
      expiresAt: 500,
    });

    const marked = await markFeedbackAnswered(queued.id);

    expect(marked).toBe(true);
    expect((await db.feedbackQueue.get(queued.id))?.status).toBe("answered");
    expect(await markFeedbackAnswered(queued.id)).toBe(false);
  });

  it("expires only pending items at or before provided timestamp", async () => {
    await queueFeedback({
      id: "pending-expired",
      sessionId: "sess-1",
      question: "A",
      options: [{ label: "A", value: "a" }],
      createdAt: 100,
      expiresAt: 200,
    });
    await queueFeedback({
      id: "pending-active",
      sessionId: "sess-2",
      question: "B",
      options: [{ label: "B", value: "b" }],
      createdAt: 100,
      expiresAt: 300,
    });
    await queueFeedback({
      id: "already-answered",
      sessionId: "sess-3",
      question: "C",
      options: [{ label: "C", value: "c" }],
      createdAt: 100,
      expiresAt: 100,
    });
    await markFeedbackAnswered("already-answered");

    const expiredCount = await expirePendingFeedback(200);

    expect(expiredCount).toBe(1);
    expect((await db.feedbackQueue.get("pending-expired"))?.status).toBe("expired");
    expect((await db.feedbackQueue.get("pending-active"))?.status).toBe("pending");
    expect((await db.feedbackQueue.get("already-answered"))?.status).toBe("answered");
  });
});
