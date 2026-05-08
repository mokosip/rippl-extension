type MetricsInput = {
  interaction_count: number;
  copy_events: number;
  paste_events: number;
};

export type BuildInput = {
  id: string;
  domain: string;
  startedAt: number;
  endedAt: number;
  durationMs: number;
  activeMs?: number;
  metrics: MetricsInput;
  extensionVersion: string;
  sourceVersion: string;
};

export type FeedbackOption = {
  label: string;
  value: string;
};

export type ParsedFeedbackRequest = {
  question: string;
  options: FeedbackOption[];
};

type BackendFeedbackRequest = {
  ask?: boolean;
  question?: string;
  options?: Array<{ label?: string; value?: string }>;
};

type BackendResponse = {
  feedback_request?: BackendFeedbackRequest;
};

export function buildActivitySessionPayload(input: BuildInput) {
  const metrics: Record<string, number> = {
    interaction_count: input.metrics.interaction_count,
    copy_events: input.metrics.copy_events,
    paste_events: input.metrics.paste_events,
    duration_ms: input.durationMs,
  };

  if (typeof input.activeMs === "number") metrics.active_ms = input.activeMs;

  return {
    collector: { type: "chrome_extension", version: input.extensionVersion },
    source: { type: "browser", version: input.sourceVersion },
    session: { id: input.id, started_at: input.startedAt, ended_at: input.endedAt },
    privacy: {
      content_collected: false,
      content_sent: false,
      prompt_collected: false,
      response_collected: false,
    },
    metrics,
    context: { domain: input.domain, surface: "web" },
  };
}

export function parseFeedbackRequest(response: BackendResponse): ParsedFeedbackRequest | null {
  const request = response.feedback_request;

  if (!request || request.ask !== true) return null;
  if (typeof request.question !== "string" || request.question.trim() === "") return null;
  if (!Array.isArray(request.options) || request.options.length === 0) return null;

  const options = request.options;
  const allOptionsValid = options.every(
    option =>
      typeof option.label === "string" &&
      option.label.trim() !== "" &&
      typeof option.value === "string" &&
      option.value.trim() !== "",
  );

  if (!allOptionsValid) return null;

  return {
    question: request.question,
    options: options as FeedbackOption[],
  };
}
