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

    if (activeSeconds < MIN_SESSION_SECONDS) {
      console.log("[rippl] session discarded (too short)", a.domain, `${activeSeconds}s`);
      return;
    }

    console.log("[rippl] session saved", a.domain, `${activeSeconds}s`, a.id);

    const mins = Math.round(activeSeconds / 60);
    const duration = mins < 1 ? "<1 min" : `${mins} min`;
    try {
      await chrome.notifications.create(`rippl-${Date.now()}`, {
        type: "basic",
        iconUrl: chrome.runtime.getURL("icon/128.png"),
        title: `Tracked ${duration} on ${a.domain}`,
        message: "Click the rippl icon to log what you did.",
        priority: 0,
      });
      console.log("[rippl] notification sent");
    } catch (e) {
      console.error("[rippl] notification failed", e);
    }

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
