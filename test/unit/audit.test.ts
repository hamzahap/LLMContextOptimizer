import { describe, it, expect } from 'vitest';
import { AuditLayer, formatAuditSummary } from '../../src/audit/index.js';
import { TaskType } from '../../src/types.js';

describe('AuditLayer', () => {
  it('records and finalizes entries', () => {
    const audit = new AuditLayer();

    audit.record({
      contextId: 'file:a.ts',
      decision: 'included',
      reason: 'High relevance',
      tokensBefore: 100,
      tokensAfter: 100,
    });

    audit.record({
      contextId: 'file:b.ts',
      decision: 'compressed',
      reason: 'Low relevance',
      tokensBefore: 200,
      tokensAfter: 50,
    });

    audit.record({
      contextId: 'file:c.ts',
      decision: 'excluded',
      reason: 'Over budget',
      tokensBefore: 300,
    });

    const log = audit.finalize(
      {
        type: TaskType.BugFix,
        confidence: 0.8,
        keywords: ['bug'],
        description: 'Fix a bug',
        focusAreas: [],
      },
      1000
    );

    expect(log.entries).toHaveLength(3);
    expect(log.summary.included).toBe(1);
    expect(log.summary.compressed).toBe(1);
    expect(log.summary.excluded).toBe(1);
    expect(log.summary.tokensUsed).toBe(150);
    expect(log.summary.tokensSaved).toBe(450);
  });

  it('formats audit summary as text', () => {
    const audit = new AuditLayer();
    audit.record({
      contextId: 'test',
      decision: 'included',
      reason: 'test reason',
    });

    const log = audit.finalize(
      {
        type: TaskType.Feature,
        confidence: 0.9,
        keywords: [],
        description: 'Add feature',
        focusAreas: [],
      },
      5000
    );

    const text = formatAuditSummary(log);
    expect(text).toContain('Context Optimization Audit');
    expect(text).toContain('Add feature');
    expect(text).toContain('INCLUDED');
  });
});
