export interface StrategyScore {
  name: string;
  score: number;
}

export function combineScores(
  scores: StrategyScore[],
  weights: Record<string, number>
): { combined: number; breakdown: Record<string, number> } {
  const breakdown: Record<string, number> = {};
  let totalWeight = 0;
  let weightedSum = 0;

  for (const { name, score } of scores) {
    const weight = weights[name] ?? 0;
    breakdown[name] = score;
    weightedSum += score * weight;
    totalWeight += weight;
  }

  const combined = totalWeight > 0 ? weightedSum / totalWeight : 0;
  return { combined: Math.min(Math.max(combined, 0), 1), breakdown };
}
