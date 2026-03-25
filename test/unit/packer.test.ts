import { describe, it, expect } from 'vitest';
import { packItems } from '../../src/packer/bin-packing.js';
import { ProtectionLevel, SourceType, type CompressedContext } from '../../src/types.js';

describe('packItems', () => {
  function makeItem(id: string, tokens: number, relevance: number, protection: ProtectionLevel): CompressedContext {
    return {
      id,
      source: SourceType.File,
      content: 'x'.repeat(tokens * 4),
      metadata: {},
      tokenCount: tokens,
      relevanceScore: relevance,
      scoreBreakdown: {},
      originalTokenCount: tokens,
      compressedContent: 'x'.repeat(tokens * 4),
      compressionRatio: 1,
      techniquesApplied: [],
      protectionLevel: protection,
    };
  }

  it('includes all items that fit in budget', () => {
    const items = [
      makeItem('a', 100, 0.8, ProtectionLevel.Normal),
      makeItem('b', 100, 0.6, ProtectionLevel.Normal),
    ];
    const { included, excluded } = packItems(items, 300);
    expect(included).toHaveLength(2);
    expect(excluded).toHaveLength(0);
  });

  it('excludes items that exceed budget', () => {
    const items = [
      makeItem('a', 100, 0.8, ProtectionLevel.Normal),
      makeItem('b', 100, 0.6, ProtectionLevel.Normal),
      makeItem('c', 100, 0.4, ProtectionLevel.Normal),
    ];
    const { included, excluded } = packItems(items, 200);
    expect(included).toHaveLength(2);
    expect(excluded).toHaveLength(1);
  });

  it('always includes Immutable items even over budget', () => {
    const items = [
      makeItem('critical', 500, 0.9, ProtectionLevel.Immutable),
      makeItem('optional', 100, 0.5, ProtectionLevel.Normal),
    ];
    const { included } = packItems(items, 100);
    expect(included.some(i => i.id === 'critical')).toBe(true);
  });

  it('prioritizes by protection level then value density', () => {
    const items = [
      makeItem('low-prot', 50, 0.9, ProtectionLevel.Expendable),
      makeItem('high-prot', 50, 0.3, ProtectionLevel.Preferred),
    ];
    const { included } = packItems(items, 60);
    expect(included[0].id).toBe('high-prot');
  });
});
