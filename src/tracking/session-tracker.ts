import { db, type Session } from "../db/index";

function generateId(): string {
  return `sess-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const BADGE_EXPIRY_MS = 24 * 60 * 60 * 1000;
const MIN_SESSION_SECONDS = 10;

interface ActiveSession {
  id: string;
  domain: string;
  startedAt: number;
  lastSeenAt: number;
  date: string;
}

export class SessionTracker {
  private active: ActiveSession | null = null;

  getActiveSession(): ActiveSession | null {
    return this.active;
  }

  async onTabFocused(domain: string | null): Promise<void> {
    if (this.active && this.active.domain === domain) return;

    if (this.active) await this.endCurrentSession();

    if (domain) {
      const now = Date.now();
      this.active = {
        id: generateId(),
        domain,
        startedAt: now,
        lastSeenAt: now,
        date: new Date(now).toISOString().slice(0, 10),
      };
    }
  }

  async onIdle(): Promise<void> {
    if (this.active) await this.endCurrentSession();
  }

  onHeartbeat(): void {
    if (!this.active) return;
    this.active.lastSeenAt = Date.now();
  }

  private async endCurrentSession(): Promise<void> {
    if (!this.active) return;

    const a = this.active;
    this.active = null;

    const endedAt = Date.now();
    const activeSeconds = Math.round((endedAt - a.startedAt) / 1000);

    if (activeSeconds < MIN_SESSION_SECONDS) return;

    const session: Session = {
      id: a.id,
      domain: a.domain,
      startedAt: a.startedAt,
      endedAt,
      activeSeconds,
      date: a.date,
      activityType: null,
      estimatedWithoutMinutes: null,
      timeSavedMinutes: null,
      logged: false,
      badgeExpiry: endedAt + BADGE_EXPIRY_MS,
    };

    await db.sessions.put(session);
  }
}
