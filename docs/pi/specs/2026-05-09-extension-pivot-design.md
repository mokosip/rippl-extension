# Extension Pivot Design — Reporter → Sensor

**Date:** 2026-05-09  
**Status:** Approved (design sections 1–5)  
**Scope mode:** Hard cutover (Approach A)

## 1) Goal

Refactor extension from self-report UX to automatic fact collector.

- Remove mandatory micro-prompt logging flow.
- Emit strict ingestion payload to backend `POST /v1/activity-sessions`.
- Add interaction + clipboard + activity-time signals via content script.
- Track `duration_ms` and `active_ms` separately.
- Add backend-driven feedback queue + popup renderer.

## 2) Source of truth + constraints

### Backend contract source of truth
Contract comes from `../rippl-dashboard` current implementation:

- `backend/src/main/kotlin/app/rippl/ingestion/IngestionController.kt`
- `backend/src/main/kotlin/app/rippl/ingestion/IngestionDtos.kt`
- `backend/src/main/kotlin/app/rippl/ingestion/IngestionService.kt`
- `backend/http/api.http`

### Current contract facts

- Endpoint: `POST /v1/activity-sessions`
- Endpoint: `POST /v1/activity-sessions/{id}/feedback`
- Strict unknown-field rejection on core DTOs (`collector/source/session/privacy`)
- Flexible maps allowed for `metrics` and `context`
- Privacy flags must all be `false`
- Response currently includes:
  - `accepted`
  - `session_id`
  - `feedback_request: { ask: false }`
  - optional `deduped: true` on conflict

## 3) Product decisions (locked)

1. **Implementation strategy:** Hard cutover (big-bang) in extension.
2. **Domain scope for content script:** built-in + user custom domains.
3. **Feedback submit value:** send selected option `value` string.
4. **History page:** keep page, pivot to neutral factual metrics only.
5. **Settings cleanup:** remove activity-type configuration UI and storage.
6. **DB migration behavior:** purge old session rows on upgrade to new schema.
7. **Feedback support:** implement full forward-compatible queue/parser now; render only when response includes complete prompt fields.

## 4) Architecture

### A. Background service worker (session authority)

Owns runtime session lifecycle and persistence.

Responsibilities:
- Tab focus + idle boundary detection.
- Create/end active session records.
- Merge content-script signal updates into active session.
- Persist completed sessions into Dexie v3 `activitySessions`.
- Trigger sync + retry handling.
- Queue feedback prompts from ingest responses.

### B. Content script (signal collector only)

Injected only on enabled AI domains (built-in + custom).

Collects only:
- `interaction_count` (click + keydown)
- `copy_events`
- `paste_events`
- activity timestamps for active-time computation

Never collects:
- prompt text
- response text
- clipboard content payload
- form/input values
- page DOM content semantics

### C. Local persistence (Dexie)

- `activitySessions` (new fact schema)
- `feedbackQueue` (pending backend prompt instances)
- keep `config` and `customDomains`

### D. UI entrypoints

- Popup becomes passive status + feedback renderer.
- History page remains, but only neutral metrics.
- Welcome/settings removes activity-type controls.

## 5) Data model design

## 5.1 Dexie schema v3

### `activitySessions`

Fields:
- `id: string` (collector session id)
- `domain: string`
- `startedAt: number`
- `endedAt: number`
- `durationMs: number`
- `activeMs?: number`
- `metrics: { interaction_count: number; copy_events: number; paste_events: number }`
- `syncStatus: "pending" | "synced" | "local"`
- `createdAt: number`

Indexes include id/domain/time/sync-status for sync + history queries.

### `feedbackQueue`

Fields:
- `id: string` (local queue id)
- `sessionId: string` (backend `session_id` UUID string)
- `question: string`
- `options: Array<{ label: string; value: string }>`
- `expiresAt: number`
- `status: "pending" | "answered" | "expired"`
- `createdAt: number`

Queue policy: FIFO, max one visible pending prompt in popup.

## 5.2 Migration behavior

Upgrade to v3 performs hard cutover:
- purge old `sessions` data rows from legacy model
- do not transform legacy self-report rows
- begin collecting only new-format sessions

## 6) Ingestion payload design

Payload extension sends:

```json
{
  "collector": { "type": "chrome_extension", "version": "<ext-version>" },
  "source": { "type": "browser", "version": "<browser-version-or-unknown>" },
  "session": {
    "id": "sess-...",
    "started_at": 1714700000000,
    "ended_at": 1714700720000
  },
  "privacy": {
    "content_collected": false,
    "content_sent": false,
    "prompt_collected": false,
    "response_collected": false
  },
  "metrics": {
    "interaction_count": 12,
    "copy_events": 2,
    "paste_events": 4,
    "duration_ms": 720000,
    "active_ms": 530000
  },
  "context": {
    "domain": "claude.ai",
    "surface": "web"
  }
}
```

Notes:
- `metrics` and `context` remain extensible.
- If no activity-signal coverage for session, omit `active_ms` key.

## 7) Runtime behavior

## 7.1 Session lifecycle

- Start when active tab URL matches enabled AI domain.
- End when:
  - focus exits matched domain, or
  - idle/locked boundary reached (existing boundary logic preserved).
- Keep short-session guard to discard accidental micro-sessions.

## 7.2 Signal merging

Content script sends incremental aggregates to background.
Background merges only into active session for current tracked domain.
If no active session exists, message is dropped silently.

## 7.3 Active time algorithm

Definitions:
- `durationMs = endedAt - startedAt`
- idle gap threshold inside session = 60s

Algorithm:
- track user-activity timestamps (mousemove/keydown/click/scroll)
- subtract inactivity portions above threshold from active accumulation
- clamp final values:
  - `activeMs >= 0`
  - `activeMs <= durationMs`

## 8) Popup / UX behavior

## 8.1 Remove legacy self-report flow

Removed entirely:
- activity pills
- "without AI" time pills
- skip/log-each/merge logging workflow
- unlogged-session badge concept

## 8.2 New popup behavior

Priority order:
1. If pending feedback exists and valid: show feedback card first.
2. Else show status-first card:
   - active session indicator (if running)
   - today session count
   - today total duration + active duration
   - links: history/settings/dashboard

## 8.3 Feedback prompt behavior

- Parse ingest response `feedback_request` forward-compatibly.
- Queue prompt only when `ask=true` and required render fields exist (`question`, `options`).
- Submit selected option via:

```json
{ "type": "task_type", "value": "<selected-option-value>" }
```

- Expire prompt automatically after 24h.
- Show max one pending prompt at a time (FIFO).

## 8.4 History page after pivot

Keep history page, but facts-only metrics:
- sessions count
- total duration
- total active duration
- per-day expandable session list

Remove local inference messaging (time saved / top activity claims).

## 8.5 Welcome/settings cleanup

- Remove activity-type configuration UI and persistence.
- Keep domain selection (built-in + custom).
- Keep dashboard token connect/disconnect.
- Keep privacy controls.

## 9) Sync + error-handling policy

## 9.1 Session ingest

- `201` or dedupe `200`: mark session `synced`
- `401`: clear token; mark unsynced rows `local`; show disconnected status
- `429/5xx/network`: keep `pending`; retry via alarm/backoff
- `400 policy/schema`: log structured error; keep pending with retry cap to avoid loops

## 9.2 Feedback submit

- success: mark queue row `answered`
- `404`: mark queue row `expired`
- transient failure: keep `pending` and retry on popup-open + periodic retry

## 10) Verification strategy

### Automated (TDD-first)

- DB migration tests (v2→v3 purge and fresh writes)
- payload builder tests against strict backend contract shape
- active-time tests (idle subtraction + clamp invariants)
- signal-merge tests (active-only merge, drop-when-no-active)
- feedback parser tests (missing future fields does not crash)
- feedback queue tests (FIFO + expiry + status transitions)
- sync state transition tests (`pending/synced/local`)

### Manual

- run extension on AI domains and verify counters increment
- inspect network payloads to `/v1/activity-sessions`
- simulate response with full `feedback_request` fixture and verify popup renders prompt
- submit feedback and verify POST value equals selected option `value`
- confirm no self-report UI remains

## 11) Rollout and non-goals

### Rollout
Single extension release with hard cutover.

### Non-goals in this pivot
- backend scoring-policy changes
- dashboard UX redesign
- local inferred “time saved” calculations
- content/script data beyond event counts + timestamps

---

## Spec self-review notes

- Placeholder scan: no TODO/TBD placeholders remain.
- Internal consistency: architecture, data model, and runtime behavior align with locked decisions.
- Scope check: big but single coherent pivot; implementation will be broken into task-level plan.
- Ambiguity check: feedback submission value, domain scope, migration purge strategy explicitly locked.
