import { describe, it, expect } from 'vitest';
import { LosslessRulesEngine } from '../../src/rules/index.js';
import { ProtectionLevel, SourceType, type CompressedContext } from '../../src/types.js';

describe('LosslessRulesEngine', () => {
  const engine = new LosslessRulesEngine();

  function makeContext(overrides: Partial<CompressedContext>): CompressedContext {
    return {
      id: 'test',
      source: SourceType.File,
      content: 'test content',
      metadata: {},
      tokenCount: 10,
      relevanceScore: 0.5,
      scoreBreakdown: {},
      originalTokenCount: 10,
      compressedContent: 'test content',
      compressionRatio: 1,
      techniquesApplied: [],
      protectionLevel: ProtectionLevel.Normal,
      ...overrides,
    };
  }

  it('marks error sources as Immutable', () => {
    const ctx = makeContext({ source: SourceType.Error });
    expect(engine.evaluate(ctx)).toBe(ProtectionLevel.Immutable);
  });

  it('marks stack trace content as Immutable', () => {
    const ctx = makeContext({
      metadata: { hasStackTrace: true },
    });
    expect(engine.evaluate(ctx)).toBe(ProtectionLevel.Immutable);
  });

  it('marks diffs as Preferred', () => {
    const ctx = makeContext({ source: SourceType.Diff });
    expect(engine.evaluate(ctx)).toBe(ProtectionLevel.Preferred);
  });

  it('marks clean logs as Expendable', () => {
    const ctx = makeContext({
      source: SourceType.Log,
      metadata: { hasErrors: false },
    });
    expect(engine.evaluate(ctx)).toBe(ProtectionLevel.Expendable);
  });

  it('restores original content for Immutable compressed items', () => {
    const ctx = makeContext({
      source: SourceType.Error,
      content: 'original error',
      compressedContent: 'compressed version',
      originalTokenCount: 20,
      tokenCount: 10,
      techniquesApplied: ['summarize'],
    });

    const [protected_] = engine.protect([ctx]);
    expect(protected_.compressedContent).toBe('original error');
    expect(protected_.techniquesApplied).toEqual([]);
  });
});
