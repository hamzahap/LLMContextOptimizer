import type { CandidateContext, TaskProfile } from '../../types.js';

export function scoreByKeyword(candidate: CandidateContext, task: TaskProfile): number {
  if (task.keywords.length === 0) return 0;

  const contentLower = candidate.content.toLowerCase();
  let matchCount = 0;

  for (const keyword of task.keywords) {
    if (contentLower.includes(keyword)) {
      matchCount++;
    }
  }

  // Also check focus areas
  for (const area of task.focusAreas) {
    if (contentLower.includes(area.toLowerCase())) {
      matchCount += 2; // Focus areas are worth more
    }
  }

  const maxPossible = task.keywords.length + task.focusAreas.length * 2;
  return maxPossible > 0 ? Math.min(matchCount / maxPossible, 1.0) : 0;
}
