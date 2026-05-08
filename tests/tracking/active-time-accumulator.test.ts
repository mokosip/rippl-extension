import { describe, expect, it } from "vitest";
import { ActiveTimeAccumulator } from "../../src/tracking/active-time-accumulator";

describe("ActiveTimeAccumulator", () => {
  it("returns full duration when no gaps exceed idle threshold", () => {
    const start = 1_000;
    const acc = new ActiveTimeAccumulator(start, 60_000);

    acc.markActivity(10_000);
    acc.markActivity(20_000);

    expect(acc.finalize(30_000)).toBe(29_000);
  });

  it("subtracts inactivity above idle threshold", () => {
    const acc = new ActiveTimeAccumulator(1_000, 60_000);

    acc.markActivity(10_000);
    acc.markActivity(120_000);

    const activeMs = acc.finalize(180_000);
    expect(activeMs).toBe(129_000);
    expect(activeMs).toBeLessThan(179_000);
    expect(activeMs).toBeGreaterThan(0);
  });

  it("clamps between zero and total duration", () => {
    const start = 10_000;
    const acc = new ActiveTimeAccumulator(start, 60_000);

    acc.markActivity(100_000);

    expect(acc.finalize(11_000)).toBe(1_000);
  });

  it("ignores non-increasing activity timestamps", () => {
    const start = 1_000;
    const acc = new ActiveTimeAccumulator(start, 60_000);

    acc.markActivity(5_000);
    acc.markActivity(5_000);
    acc.markActivity(4_000);

    expect(acc.finalize(6_000)).toBe(5_000);
  });
});
