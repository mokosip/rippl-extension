import type { Session } from "../db/index";

const MIN_SESSION_SECONDS = 10;
const MERGE_GAP_SECONDS = 120;

export function mergeAndFilterSessions(sessions: Session[]): Session[] {
  const filtered = sessions.filter(s => s.activeSeconds >= MIN_SESSION_SECONDS);
  if (filtered.length === 0) return [];

  const sorted = [...filtered].sort((a, b) => a.startedAt - b.startedAt);
  const merged: Session[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const last = merged[merged.length - 1];
    const gapSeconds = (current.startedAt - last.endedAt) / 1000;

    if (current.domain === last.domain && gapSeconds <= MERGE_GAP_SECONDS) {
      merged[merged.length - 1] = {
        ...last,
        endedAt: current.endedAt,
        activeSeconds: last.activeSeconds + current.activeSeconds,
      };
    } else {
      merged.push(current);
    }
  }

  return merged;
}
