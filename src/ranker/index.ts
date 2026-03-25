import type { IRelevanceRanker, CandidateContext, ScoredContext, TaskProfile } from '../types.js';
import { scoreByKeyword } from './strategies/keyword-strategy.js';
import { scoreByRecency } from './strategies/recency-strategy.js';
import { scoreByDependency } from './strategies/dependency-strategy.js';
import { scoreByTaskAffinity } from './strategies/task-affinity-strategy.js';
import { combineScores } from './score-combiner.js';

export class RelevanceRanker implements IRelevanceRanker {
  private weights: Record<string, number>;

  constructor(weights?: Record<string, number>) {
    this.weights = weights ?? {
      keyword: 0.4,
      recency: 0.2,
      dependency: 0.2,
      taskAffinity: 0.2,
    };
  }

  rank(candidates: CandidateContext[], task: TaskProfile): ScoredContext[] {
    const scored: ScoredContext[] = candidates.map(candidate => {
      const scores = [
        { name: 'keyword', score: scoreByKeyword(candidate, task) },
        { name: 'recency', score: scoreByRecency(candidate) },
        { name: 'dependency', score: scoreByDependency(candidate, task, candidates) },
        { name: 'taskAffinity', score: scoreByTaskAffinity(candidate, task) },
      ];

      const { combined, breakdown } = combineScores(scores, this.weights);

      return {
        ...candidate,
        relevanceScore: combined,
        scoreBreakdown: breakdown,
      };
    });

    // Sort by relevance descending
    scored.sort((a, b) => b.relevanceScore - a.relevanceScore);
    return scored;
  }
}
