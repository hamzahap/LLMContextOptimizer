import type { CandidateContext } from '../../types.js';

const ONE_HOUR = 60 * 60 * 1000;
const ONE_DAY = 24 * ONE_HOUR;

export function scoreByRecency(candidate: CandidateContext): number {
  if (!candidate.timestamp) {
    // No timestamp — give a neutral score
    return 0.5;
  }

  const age = Date.now() - candidate.timestamp.getTime();

  // Exponential decay: full score within 1 hour, halved per day
  if (age <= ONE_HOUR) return 1.0;
  if (age <= ONE_DAY) return 0.8;

  const days = age / ONE_DAY;
  return Math.max(0.1, Math.exp(-0.3 * days));
}
