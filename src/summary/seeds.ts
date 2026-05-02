export function humanScaleComparison(minutes: number): string {
  if (minutes < 15) return "A coffee break";
  if (minutes < 30) return "A walk around the block";
  if (minutes < 60) return "Enough to cook a meal";
  if (minutes < 120) return "A long lunch with a friend";
  if (minutes < 240) return "A half-day at the park";
  return "A full afternoon — yours to shape";
}
