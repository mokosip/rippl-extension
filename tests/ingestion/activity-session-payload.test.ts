import { describe, it, expect } from "vitest";
import {
  buildActivitySessionPayload,
  parseFeedbackRequest,
} from "../../src/ingestion/activity-session-payload";

describe("buildActivitySessionPayload", () => {
  it("builds backend-compatible payload", () => {
    const payload = buildActivitySessionPayload({
      id: "sess-1",
      domain: "claude.ai",
      startedAt: 1000,
      endedAt: 4000,
      durationMs: 3000,
      activeMs: 2000,
      metrics: { interaction_count: 5, copy_events: 1, paste_events: 2 },
      extensionVersion: "1.0.0",
      sourceVersion: "126",
    });

    expect(payload.collector).toEqual({ type: "chrome_extension", version: "1.0.0" });
    expect(payload.source).toEqual({ type: "browser", version: "126" });
    expect(payload.session).toEqual({ id: "sess-1", started_at: 1000, ended_at: 4000 });
    expect(payload.privacy).toEqual({
      content_collected: false,
      content_sent: false,
      prompt_collected: false,
      response_collected: false,
    });
    expect(payload.metrics.active_ms).toBe(2000);
  });
});

describe("parseFeedbackRequest", () => {
  it("returns queueable payload only for ask=true + complete question/options", () => {
    expect(parseFeedbackRequest({ feedback_request: { ask: false } })).toBeNull();
    expect(parseFeedbackRequest({ feedback_request: { ask: true } })).toBeNull();

    const out = parseFeedbackRequest({
      feedback_request: {
        ask: true,
        question: "What task type?",
        options: [{ label: "Coding", value: "coding" }],
      },
    });

    expect(out?.question).toBe("What task type?");
    expect(out?.options[0].value).toBe("coding");
  });
});
