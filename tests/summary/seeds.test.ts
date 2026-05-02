import { describe, it, expect } from "vitest";
import { humanScaleComparison } from "../../src/summary/seeds";

describe("humanScaleComparison", () => {
  // Tier 1: < 15 min → "A coffee break"
  it("returns 'A coffee break' for 0 minutes", () => {
    expect(humanScaleComparison(0)).toBe("A coffee break");
  });

  it("returns 'A coffee break' for 14 minutes", () => {
    expect(humanScaleComparison(14)).toBe("A coffee break");
  });

  it("returns 'A coffee break' for negative input", () => {
    expect(humanScaleComparison(-5)).toBe("A coffee break");
  });

  // Tier 2: 15–29 min → "A walk around the block"
  it("returns 'A walk around the block' for 15 minutes (boundary)", () => {
    expect(humanScaleComparison(15)).toBe("A walk around the block");
  });

  it("returns 'A walk around the block' for 29 minutes", () => {
    expect(humanScaleComparison(29)).toBe("A walk around the block");
  });

  // Tier 3: 30–59 min → "Enough to cook a meal"
  it("returns 'Enough to cook a meal' for 30 minutes (boundary)", () => {
    expect(humanScaleComparison(30)).toBe("Enough to cook a meal");
  });

  it("returns 'Enough to cook a meal' for 59 minutes", () => {
    expect(humanScaleComparison(59)).toBe("Enough to cook a meal");
  });

  // Tier 4: 60–119 min → "A long lunch with a friend"
  it("returns 'A long lunch with a friend' for 60 minutes (boundary)", () => {
    expect(humanScaleComparison(60)).toBe("A long lunch with a friend");
  });

  it("returns 'A long lunch with a friend' for 119 minutes", () => {
    expect(humanScaleComparison(119)).toBe("A long lunch with a friend");
  });

  // Tier 5: 120–239 min → "A half-day at the park"
  it("returns 'A half-day at the park' for 120 minutes (boundary)", () => {
    expect(humanScaleComparison(120)).toBe("A half-day at the park");
  });

  it("returns 'A half-day at the park' for 239 minutes", () => {
    expect(humanScaleComparison(239)).toBe("A half-day at the park");
  });

  // Tier 6: 240+ min → "A full afternoon — yours to shape"
  it("returns 'A full afternoon — yours to shape' for 240 minutes (boundary)", () => {
    expect(humanScaleComparison(240)).toBe("A full afternoon — yours to shape");
  });

  it("returns 'A full afternoon — yours to shape' for 300 minutes", () => {
    expect(humanScaleComparison(300)).toBe("A full afternoon — yours to shape");
  });
});
