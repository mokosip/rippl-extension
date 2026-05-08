# Extension Pivot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace self-report extension flow with sensor-only tracking that emits strict v1 ingestion payloads, collects interaction/activity signals, and renders backend-driven feedback prompts.

**Architecture:** Background service worker becomes single session authority. It receives tab/idle events plus content-script signal deltas, computes `duration_ms` and `active_ms`, persists `activitySessions` and syncs to `/v1/activity-sessions`. Popup becomes feedback-first/status-second renderer from local state. History remains but shows neutral fact metrics only.

**Tech Stack:** TypeScript, WXT, Dexie, Chrome Extension APIs (`tabs`, `idle`, `alarms`, `scripting`, `runtime messaging`), Vitest + fake-indexeddb.

---

## File Structure

### Create
- `src/ingestion/activity-session-payload.ts` — strict v1 payload builder + response parser.
- `src/feedback/feedback-queue.ts` — queue insert/read/expire/answer helpers.
- `src/tracking/active-time-accumulator.ts` — pure active-time algorithm.
- `src/tracking/signal-types.ts` — message and metric types for content/background.
- `tests/ingestion/activity-session-payload.test.ts` — payload/parse tests.
- `tests/feedback/feedback-queue.test.ts` — queue lifecycle tests.
- `tests/tracking/active-time-accumulator.test.ts` — idle subtraction tests.
- `tests/db/schema-v3.test.ts` — Dexie v3 migration + purge test.

### Modify
- `src/db/index.ts` — v3 schema, new tables/types, legacy purge.
- `src/db/queries.ts` — replace old session helpers with sensor helpers.
- `src/tracking/session-tracker.ts` — sensor session model + metric merging.
- `src/entrypoints/background.ts` — injection, signal merge, v1 sync, feedback queue, popup status messaging.
- `src/sync/dashboard-sync.ts` — move to v1 endpoints + strict contract.
- `src/entrypoints/popup/index.html` — remove self-report states; add feedback-first/status UI.
- `src/entrypoints/popup/main.ts` — render pending feedback or status summary.
- `src/entrypoints/popup/style.css` — new compact layout.
- `src/summary/weekly-summary.ts` — neutral weekly facts only.
- `src/entrypoints/history/main.ts` — neutral metrics rendering.
- `src/entrypoints/history/style.css` — remove “saved/activity inference” styling bits.
- `src/entrypoints/welcome/index.html` — remove activity-type section.
- `src/entrypoints/welcome/main.ts` — remove activity storage logic; keep domains/token/privacy.
- `src/entrypoints/welcome/style.css` — remove activity UI styles.
- `wxt.config.ts` — host permission updates for built-in AI domains + dashboard.
- `tests/tracking/session-tracker.test.ts` — adapt expectations to new model.
- `tests/db/queries.test.ts` — replace log/skip tests with sensor query tests.

---

### Task 1: Dexie v3 schema + legacy purge

**Files:**
- Modify: `src/db/index.ts`
- Create: `tests/db/schema-v3.test.ts`

- [ ] **Step 1: Write failing migration/purge test**

```ts
import { describe, it, expect } from "vitest";
import Dexie from "dexie";
import { createRipplDb } from "../../src/db/index";

describe("db v3 migration", () => {
  it("purges legacy sessions and initializes new tables", async () => {
    const name = `rippl-migrate-${Date.now()}`;

    const legacy = new Dexie(name);
    legacy.version(2).stores({
      sessions: "id, domain, date, logged, badgeExpiry, syncStatus",
      config: "key",
      customDomains: "hostname",
    });
    await legacy.open();
    await legacy.table("sessions").add({ id: "legacy-1", domain: "claude.ai", logged: true });
    await legacy.close();

    const db = createRipplDb(name);
    await db.open();

    expect(await db.activitySessions.count()).toBe(0);
    expect(await db.feedbackQueue.count()).toBe(0);

    await db.close();
    await Dexie.delete(name);
  });
});
```

- [ ] **Step 2: Run test to verify RED**

Run: `npx vitest run tests/db/schema-v3.test.ts`
Expected: FAIL (`createRipplDb` and `activitySessions/feedbackQueue` not defined).

- [ ] **Step 3: Implement v3 schema + factory**

```ts
// src/db/index.ts (core shape)
export interface ActivitySession {
  id: string;
  domain: string;
  startedAt: number;
  endedAt: number;
  durationMs: number;
  activeMs?: number;
  metrics: {
    interaction_count: number;
    copy_events: number;
    paste_events: number;
  };
  syncStatus: "pending" | "synced" | "local";
  createdAt: number;
}

export interface FeedbackQueueItem {
  id: string;
  sessionId: string;
  question: string;
  options: Array<{ label: string; value: string }>;
  expiresAt: number;
  status: "pending" | "answered" | "expired";
  createdAt: number;
}

export function createRipplDb(name = "rippl") {
  const database = new Dexie(name) as Dexie & {
    activitySessions: EntityTable<ActivitySession, "id">;
    feedbackQueue: EntityTable<FeedbackQueueItem, "id">;
    config: EntityTable<Config, "key">;
    customDomains: EntityTable<CustomDomain, "hostname">;
  };

  database.version(3).stores({
    activitySessions: "id, domain, startedAt, endedAt, syncStatus, createdAt",
    feedbackQueue: "id, sessionId, status, expiresAt, createdAt",
    config: "key",
    customDomains: "hostname",
  }).upgrade(async tx => {
    await tx.table("sessions").clear(); // hard cutover purge
  });

  return database;
}

export const db = createRipplDb();
```

- [ ] **Step 4: Run targeted tests to verify GREEN**

Run: `npx vitest run tests/db/schema-v3.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/db/index.ts tests/db/schema-v3.test.ts
git commit -m "feat: add Dexie v3 schema with legacy purge"
```

---

### Task 2: Strict v1 payload builder + response parser

**Files:**
- Create: `src/ingestion/activity-session-payload.ts`
- Create: `tests/ingestion/activity-session-payload.test.ts`

- [ ] **Step 1: Write failing contract tests**

```ts
import { describe, it, expect } from "vitest";
import { buildActivitySessionPayload, parseFeedbackRequest } from "../../src/ingestion/activity-session-payload";

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
```

- [ ] **Step 2: Run RED test**

Run: `npx vitest run tests/ingestion/activity-session-payload.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement builder/parser**

```ts
// src/ingestion/activity-session-payload.ts
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
```

- [ ] **Step 4: Run GREEN test**

Run: `npx vitest run tests/ingestion/activity-session-payload.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ingestion/activity-session-payload.ts tests/ingestion/activity-session-payload.test.ts
git commit -m "feat: add strict v1 activity payload builder and feedback parser"
```

---

### Task 3: Active-time algorithm + session tracker refactor

**Files:**
- Create: `src/tracking/active-time-accumulator.ts`
- Modify: `src/tracking/session-tracker.ts`
- Create: `tests/tracking/active-time-accumulator.test.ts`
- Modify: `tests/tracking/session-tracker.test.ts`

- [ ] **Step 1: Write failing active-time and tracker tests**

```ts
// tests/tracking/active-time-accumulator.test.ts
it("subtracts inactivity above 60s", () => {
  const acc = new ActiveTimeAccumulator(1_000, 60_000);
  acc.markActivity(10_000);
  acc.markActivity(120_000);
  const active = acc.finalize(180_000);
  expect(active).toBeLessThan(179_000);
  expect(active).toBeGreaterThan(0);
});

// tests/tracking/session-tracker.test.ts
it("stores durationMs and metrics defaults on session end", async () => {
  // ... start + end
  expect(saved.durationMs).toBe(30_000);
  expect(saved.metrics).toEqual({ interaction_count: 0, copy_events: 0, paste_events: 0 });
});
```

- [ ] **Step 2: Run RED tests**

Run: `npx vitest run tests/tracking/active-time-accumulator.test.ts tests/tracking/session-tracker.test.ts`
Expected: FAIL (new types/fields missing).

- [ ] **Step 3: Implement accumulator + tracker merge API**

```ts
// src/tracking/active-time-accumulator.ts
export class ActiveTimeAccumulator {
  constructor(private readonly startedAt: number, private readonly idleMs = 60_000) {}
  private events: number[] = [this.startedAt];

  markActivity(ts: number) {
    if (ts > this.events[this.events.length - 1]) this.events.push(ts);
  }

  finalize(endedAt: number): number {
    const points = [...this.events, endedAt];
    let active = 0;
    for (let i = 1; i < points.length; i++) {
      const gap = points[i] - points[i - 1];
      active += Math.min(gap, this.idleMs);
    }
    const duration = Math.max(0, endedAt - this.startedAt);
    return Math.max(0, Math.min(active, duration));
  }
}
```

```ts
// session-tracker method shape
onSignalDelta(delta: { interaction_count?: number; copy_events?: number; paste_events?: number; activityTs?: number }) {
  if (!this.active) return;
  this.active.metrics.interaction_count += delta.interaction_count ?? 0;
  this.active.metrics.copy_events += delta.copy_events ?? 0;
  this.active.metrics.paste_events += delta.paste_events ?? 0;
  if (delta.activityTs) this.active.activeTime.markActivity(delta.activityTs);
}
```

- [ ] **Step 4: Run GREEN tests**

Run: `npx vitest run tests/tracking/active-time-accumulator.test.ts tests/tracking/session-tracker.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/tracking/active-time-accumulator.ts src/tracking/session-tracker.ts tests/tracking/active-time-accumulator.test.ts tests/tracking/session-tracker.test.ts
git commit -m "feat: compute active_ms and merge interaction metrics into sessions"
```

---

### Task 4: Feedback queue + v1 sync layer

**Files:**
- Create: `src/feedback/feedback-queue.ts`
- Create: `tests/feedback/feedback-queue.test.ts`
- Modify: `src/sync/dashboard-sync.ts`

- [ ] **Step 1: Write failing queue/sync tests**

```ts
// tests/feedback/feedback-queue.test.ts
it("queues pending prompt and expires after ttl", async () => {
  await queueFeedbackPrompt({ sessionId: "abc", question: "Task?", options: [{ label: "Coding", value: "coding" }] });
  expect((await getNextPendingFeedback())?.sessionId).toBe("abc");
  await expireFeedbackQueue(Date.now() + 25 * 60 * 60 * 1000);
  expect(await getNextPendingFeedback()).toBeNull();
});
```

```ts
// tests/sync (add under existing sync tests or new file)
it("posts to /v1/activity-sessions and marks synced", async () => {
  global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ accepted: true, session_id: "uuid", feedback_request: { ask: false } }), { status: 201 }));
  await syncSessions();
  expect(fetch).toHaveBeenCalledWith(expect.stringContaining('/v1/activity-sessions'), expect.anything());
});
```

- [ ] **Step 2: Run RED tests**

Run: `npx vitest run tests/feedback/feedback-queue.test.ts tests/db/queries.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement queue + sync migration**

```ts
// src/feedback/feedback-queue.ts
export async function queueFeedbackPrompt(input: { sessionId: string; question: string; options: Array<{label: string; value: string}> }) {
  await db.feedbackQueue.put({
    id: `fb-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    sessionId: input.sessionId,
    question: input.question,
    options: input.options,
    status: "pending",
    createdAt: Date.now(),
    expiresAt: Date.now() + 24 * 60 * 60 * 1000,
  });
}
```

```ts
// src/sync/dashboard-sync.ts (core)
const INGEST_URL = `${DASHBOARD_URL}/v1/activity-sessions`;
const FEEDBACK_URL = (id: string) => `${DASHBOARD_URL}/v1/activity-sessions/${id}/feedback`;

// send one session per request (backend contract)
// parse feedback_request; queue only when complete
```

- [ ] **Step 4: Run GREEN tests**

Run: `npx vitest run tests/feedback/feedback-queue.test.ts tests/ingestion/activity-session-payload.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/feedback/feedback-queue.ts src/sync/dashboard-sync.ts tests/feedback/feedback-queue.test.ts
git commit -m "feat: switch sync to v1 ingestion and add feedback queue"
```

---

### Task 5: Background integration + content signal injection

**Files:**
- Create: `src/tracking/signal-types.ts`
- Modify: `src/entrypoints/background.ts`
- Modify: `wxt.config.ts`

- [ ] **Step 1: Write failing tests for signal delta handling (pure helper extraction)**

```ts
// extract pure merge helper in background-adjacent module and test it
it("drops signal update when no active session", () => {
  expect(applySignalDelta(null, { interaction_count: 1 })).toBeNull();
});
```

- [ ] **Step 2: Run RED tests**

Run: `npx vitest run tests/tracking/session-tracker.test.ts`
Expected: FAIL for missing signal merge path.

- [ ] **Step 3: Implement injection + message flow**

```ts
// background.ts, on AI-tab focus
await chrome.scripting.executeScript({
  target: { tabId },
  func: () => {
    const key = "__rippl_signal_installed__";
    if ((window as any)[key]) return;
    (window as any)[key] = true;

    let interaction = 0, copy = 0, paste = 0;
    let lastActivity = Date.now();

    const flush = () => {
      chrome.runtime.sendMessage({
        type: "interaction-update",
        counts: { interaction_count: interaction, copy_events: copy, paste_events: paste, activityTs: lastActivity },
      });
      interaction = 0; copy = 0; paste = 0;
    };

    const onInteraction = () => { interaction += 1; lastActivity = Date.now(); };
    const onCopy = () => { copy += 1; lastActivity = Date.now(); };
    const onPaste = () => { paste += 1; lastActivity = Date.now(); };
    const onActivity = () => { lastActivity = Date.now(); };

    document.addEventListener("click", onInteraction, true);
    document.addEventListener("keydown", onInteraction, true);
    document.addEventListener("copy", onCopy, true);
    document.addEventListener("paste", onPaste, true);
    document.addEventListener("mousemove", onActivity, { capture: true, passive: true });
    document.addEventListener("scroll", onActivity, { capture: true, passive: true });

    setInterval(flush, 5000);
  },
});
```

Also update `wxt.config.ts` host permissions to include built-in AI hosts (plus existing dashboard hosts).

- [ ] **Step 4: Run targeted tests + build**

Run:
- `npx vitest run tests/tracking/session-tracker.test.ts`
- `npm run build`

Expected: tests PASS, build PASS.

- [ ] **Step 5: Commit**

```bash
git add src/entrypoints/background.ts src/tracking/signal-types.ts wxt.config.ts
git commit -m "feat: wire content signal collection into background session tracking"
```

---

### Task 6: Popup rewrite (feedback-first, status-first fallback)

**Files:**
- Modify: `src/entrypoints/popup/index.html`
- Modify: `src/entrypoints/popup/main.ts`
- Modify: `src/entrypoints/popup/style.css`

- [ ] **Step 1: Write failing UI-state tests via extracted view-model helper**

```ts
// create pure helper in popup/main.ts or separate file and test it
it("prefers feedback view when pending feedback exists", () => {
  const view = choosePopupView({ pendingFeedback: true, activeSession: null });
  expect(view).toBe("feedback");
});
```

- [ ] **Step 2: Run RED test**

Run: `npx vitest run tests/summary/daily-summary.test.ts` (plus new popup helper test file)
Expected: popup helper test FAIL initially.

- [ ] **Step 3: Implement new popup structure**

```html
<!-- popup/index.html core containers -->
<div id="feedback-view" class="state hidden">
  <p id="feedback-question"></p>
  <div id="feedback-options"></div>
</div>

<div id="status-view" class="state hidden">
  <p id="active-session"></p>
  <p id="today-stats"></p>
  <button id="btn-history">History</button>
  <button id="btn-settings">Settings</button>
</div>
```

```ts
// popup/main.ts behavior
// 1) expire queue
// 2) load next pending feedback
// 3) render feedback if exists else status
// 4) feedback submit => POST value string, mark answered, re-render status
```

- [ ] **Step 4: Run popup-related tests + full suite**

Run:
- `npx vitest run`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/entrypoints/popup/index.html src/entrypoints/popup/main.ts src/entrypoints/popup/style.css
git commit -m "feat: replace self-report popup with feedback-first status UI"
```

---

### Task 7: History neutral metrics + welcome cleanup

**Files:**
- Modify: `src/summary/weekly-summary.ts`
- Modify: `tests/summary/weekly-summary.test.ts`
- Modify: `src/entrypoints/history/main.ts`
- Modify: `src/entrypoints/history/style.css`
- Modify: `src/entrypoints/welcome/index.html`
- Modify: `src/entrypoints/welcome/main.ts`
- Modify: `src/entrypoints/welcome/style.css`

- [ ] **Step 1: Write failing weekly-summary tests for neutral model**

```ts
it("computes totalDurationMs and totalActiveMs without logged/activity fields", () => {
  const result = computeWeeklySummary([
    { id: "s1", domain: "Claude", startedAt: 1, endedAt: 11, durationMs: 10, activeMs: 8, metrics: { interaction_count: 0, copy_events: 0, paste_events: 0 }, syncStatus: "synced", createdAt: 1 },
  ], "2026-05-01", "2026-05-07");

  expect(result.totalDurationMinutes).toBe(0);
  expect(result.totalActiveMinutes).toBe(0);
  expect(result.totalSessions).toBe(1);
});
```

- [ ] **Step 2: Run RED tests**

Run: `npx vitest run tests/summary/weekly-summary.test.ts`
Expected: FAIL (legacy fields referenced).

- [ ] **Step 3: Implement neutral summaries + welcome cleanup**

```ts
// weekly-summary.ts core result
{
  totalSessions,
  totalDurationMinutes,
  totalActiveMinutes,
  mostUsedTool,
  dailySummaries
}
```

Also remove activity picker block from welcome HTML and corresponding logic from `welcome/main.ts`.

- [ ] **Step 4: Run GREEN tests + build**

Run:
- `npx vitest run tests/summary/weekly-summary.test.ts`
- `npm run build`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/summary/weekly-summary.ts tests/summary/weekly-summary.test.ts src/entrypoints/history/main.ts src/entrypoints/history/style.css src/entrypoints/welcome/index.html src/entrypoints/welcome/main.ts src/entrypoints/welcome/style.css
git commit -m "feat: switch history to neutral metrics and remove activity settings UI"
```

---

### Task 8: End-to-end verification + cleanup

**Files:**
- Modify as needed from findings.

- [ ] **Step 1: Run complete automated verification**

Run:
- `npm test`
- `npm run build`

Expected: all tests pass, build passes.

- [ ] **Step 2: Manual extension verification checklist**

1. Load `.output/chrome-mv3/` in `chrome://extensions`.
2. On AI domain, generate click/keydown/copy/paste, switch tabs, then inspect IndexedDB row:
   - has `durationMs`
   - has `metrics.interaction_count/copy_events/paste_events`
   - has `activeMs` (or omitted when no activity signals)
3. Confirm network POST hits `/v1/activity-sessions` with strict shape.
4. Force/mock `feedback_request.ask=true` + `question/options`; confirm popup shows feedback first.
5. Submit feedback; verify POST `/v1/activity-sessions/{id}/feedback` body value equals selected option `value`.
6. Confirm popup no longer contains activity/time self-report UI.
7. Confirm history page shows neutral metrics only.

- [ ] **Step 3: Commit final fixes if needed**

```bash
git add -A
git commit -m "fix: finalize extension pivot integration and verification fixes"
```

(Only if Step 2 required changes.)

---

## Plan Self-Review

### Spec coverage
- Schema refactor + v1 sync: covered in Tasks 1, 2, 4.
- Content signals + active time: covered in Tasks 3, 5.
- Remove self-report flow: covered in Task 6.
- Backend-driven feedback queue/UI/submit: covered in Tasks 4, 6.
- Keep history but neutral metrics + settings cleanup: covered in Task 7.

### Placeholder scan
- No TODO/TBD placeholders in task steps.
- Every code-writing step includes concrete file path and code skeleton.
- Every task includes explicit commands and expected outcomes.

### Type consistency
- Uses `durationMs`/`activeMs` consistently in new session model.
- Uses backend field names `started_at` / `ended_at` only in payload builder.
- Feedback submit shape always `{ type, value }`.
