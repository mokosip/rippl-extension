export class ActiveTimeAccumulator {
  private points: number[];

  constructor(
    private readonly startedAt: number,
    private readonly idleThresholdMs = 60_000,
  ) {
    this.points = [startedAt];
  }

  markActivity(ts: number): void {
    const lastPoint = this.points[this.points.length - 1];
    if (ts > lastPoint) this.points.push(ts);
  }

  finalize(endedAt: number): number {
    const durationMs = Math.max(0, endedAt - this.startedAt);

    let activeMs = 0;
    const allPoints = [...this.points, endedAt];

    for (let i = 1; i < allPoints.length; i += 1) {
      const gapMs = allPoints[i] - allPoints[i - 1];
      if (gapMs <= 0) continue;
      activeMs += Math.min(gapMs, this.idleThresholdMs);
    }

    return Math.max(0, Math.min(activeMs, durationMs));
  }
}
