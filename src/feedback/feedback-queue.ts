import { db, type FeedbackQueueItem } from "../db/index";

export const FEEDBACK_QUEUE_EXPIRY_MS = 24 * 60 * 60 * 1000;

export type QueueFeedbackInput = {
  id?: string;
  sessionId: string;
  question: string;
  options: FeedbackQueueItem["options"];
  createdAt?: number;
  expiresAt?: number;
};

function generateQueueId(): string {
  return `fbq-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function queueFeedback(input: QueueFeedbackInput): Promise<FeedbackQueueItem> {
  const createdAt = input.createdAt ?? Date.now();
  const expiresAt = input.expiresAt ?? createdAt + FEEDBACK_QUEUE_EXPIRY_MS;

  const item: FeedbackQueueItem = {
    id: input.id ?? generateQueueId(),
    sessionId: input.sessionId,
    question: input.question,
    options: input.options,
    expiresAt,
    status: "pending",
    createdAt,
  };

  await db.feedbackQueue.put(item);
  return item;
}

export async function expirePendingFeedback(now = Date.now()): Promise<number> {
  return db.feedbackQueue
    .where("status")
    .equals("pending")
    .and(item => item.expiresAt <= now)
    .modify({ status: "expired" });
}

export async function getNextPendingFeedback(now = Date.now()): Promise<FeedbackQueueItem | null> {
  await expirePendingFeedback(now);

  const pending = await db.feedbackQueue
    .where("status")
    .equals("pending")
    .and(item => item.expiresAt > now)
    .sortBy("createdAt");

  return pending[0] ?? null;
}

export async function markFeedbackAnswered(id: string): Promise<boolean> {
  const item = await db.feedbackQueue.get(id);
  if (!item || item.status !== "pending") return false;

  await db.feedbackQueue.update(id, { status: "answered" });
  return true;
}
