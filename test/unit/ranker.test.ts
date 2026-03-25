import { describe, it, expect } from 'vitest';
import { RelevanceRanker } from '../../src/ranker/index.js';
import { TaskType, SourceType, type CandidateContext, type TaskProfile } from '../../src/types.js';

describe('RelevanceRanker', () => {
  const ranker = new RelevanceRanker();

  const task: TaskProfile = {
    type: TaskType.BugFix,
    confidence: 0.8,
    keywords: ['authentication', 'login', 'token', 'error'],
    description: 'Fix the authentication bug',
    focusAreas: ['src/auth.ts'],
  };

  const candidates: CandidateContext[] = [
    {
      id: 'file:auth.ts',
      source: SourceType.File,
      path: 'src/auth.ts',
      content: 'import { verify } from "jsonwebtoken";\nexport function validateToken(token: string) { return verify(token, secret); }',
      metadata: {},
      tokenCount: 30,
    },
    {
      id: 'file:utils.ts',
      source: SourceType.File,
      path: 'src/utils.ts',
      content: 'export function capitalize(str: string) { return str.charAt(0).toUpperCase() + str.slice(1); }',
      metadata: {},
      tokenCount: 25,
    },
    {
      id: 'error:0',
      source: SourceType.Error,
      content: 'TypeError: Cannot read properties of undefined (reading "role")\n    at validateToken (src/auth.ts:38:42)',
      metadata: { hasStackTrace: true },
      tokenCount: 20,
    },
  ];

  it('ranks relevant items higher', () => {
    const scored = ranker.rank(candidates, task);
    // Error with stack trace about auth should rank high
    const errorItem = scored.find(s => s.id === 'error:0');
    const utilsItem = scored.find(s => s.id === 'file:utils.ts');
    expect(errorItem!.relevanceScore).toBeGreaterThan(utilsItem!.relevanceScore);
  });

  it('returns all candidates scored', () => {
    const scored = ranker.rank(candidates, task);
    expect(scored).toHaveLength(3);
    for (const item of scored) {
      expect(item.relevanceScore).toBeGreaterThanOrEqual(0);
      expect(item.relevanceScore).toBeLessThanOrEqual(1);
      expect(item.scoreBreakdown).toBeDefined();
    }
  });

  it('sorts by relevance descending', () => {
    const scored = ranker.rank(candidates, task);
    for (let i = 1; i < scored.length; i++) {
      expect(scored[i - 1].relevanceScore).toBeGreaterThanOrEqual(scored[i].relevanceScore);
    }
  });
});
