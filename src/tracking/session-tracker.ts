import { db, type ActivitySession } from "../db/index";
import { ActiveTimeAccumulator } from "./active-time-accumulator";
import type { SignalDelta } from "./signal-types";

function generateId(): string {
  return `sess-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const MIN_SESSION_SECONDS = 10;
const ACTIVE_IDLE_THRESHOLD_MS = 60_000;

interface ActiveSession {
  id: string;
  domain: string;
  startedAt: number;
  lastSeenAt: number;
  metrics: ActivitySession["metrics"];
  activeTime: ActiveTimeAccumulator;
}

export class SessionTracker {
  private active: ActiveSession | null = null;
  onSessionEnd: ((session: ActivitySession) => void) | null = null;

  getActiveSession(): ActiveSession | null {
    return this.active;
  }

  async onTabFocused(domain: string | null): Promise<void> {
    if (this.active && this.active.domain === domain) return;

    if (this.active) await this.endCurrentSession();

    if (!domain) return;

    const now = Date.now();
    this.active = {
      id: generateId(),
      domain,
      startedAt: now,
      lastSeenAt: now,
      metrics: {
        interaction_count: 0,
        copy_events: 0,
        paste_events: 0,
      },
      activeTime: new ActiveTimeAccumulator(now, ACTIVE_IDLE_THRESHOLD_MS),
    };
  }

  async onIdle(): Promise<void> {
    if (this.active) await this.endCurrentSession();
  }

  onHeartbeat(): void {
    if (!this.active) return;

    const now = Date.now();
    this.active.lastSeenAt = now;
    this.active.activeTime.markActivity(now);
  }

  onSignalDelta(delta: SignalDelta): void {
    if (!this.active) return;

    this.active.metrics.interaction_count += delta.interaction_count ?? 0;
    this.active.metrics.copy_events += delta.copy_events ?? 0;
    this.active.metrics.paste_events += delta.paste_events ?? 0;

    if (typeof delta.activityTs === "number") {
      this.active.activeTime.markActivity(delta.activityTs);
    }
  }

  private async endCurrentSession(): Promise<void> {
    if (!this.active) return;

    const a = this.active;
    this.active = null;

    const endedAt = Date.now();
    const durationMs = Math.max(0, endedAt - a.startedAt);
    const durationSeconds = Math.round(durationMs / 1000);

    if (durationSeconds < MIN_SESSION_SECONDS) {
      console.log("[rippl] session discarded (too short)", a.domain, `${durationSeconds}s`);
      return;
    }

    console.log("[rippl] session saved", a.domain, `${durationSeconds}s`, a.id);

    const activeMs = a.activeTime.finalize(endedAt);

    const session: ActivitySession = {
      id: a.id,
      domain: a.domain,
      startedAt: a.startedAt,
      endedAt,
      durationMs,
      activeMs,
      metrics: {
        interaction_count: a.metrics.interaction_count,
        copy_events: a.metrics.copy_events,
        paste_events: a.metrics.paste_events,
      },
      syncStatus: "pending",
      createdAt: endedAt,
    };

    await db.activitySessions.put(session);
    this.onSessionEnd?.(session);
  }
}
