import { describe, it, expect } from 'vitest';
import { countTokens, estimateTokenBudget } from '../../src/token-counter.js';

describe('countTokens', () => {
  it('returns 0 for empty string', () => {
    expect(countTokens('')).toBe(0);
  });

  it('estimates tokens for plain text', () => {
    const text = 'The quick brown fox jumps over the lazy dog';
    const tokens = countTokens(text);
    // ~44 chars / 4 chars per token = ~11
    expect(tokens).toBeGreaterThan(5);
    expect(tokens).toBeLessThan(20);
  });

  it('uses code ratio for code-like content', () => {
    const code = 'export function hello(): string {\n  return "world";\n}';
    const tokens = countTokens(code, 'file.ts');
    expect(tokens).toBeGreaterThan(0);
  });

  it('detects code heuristically without file path', () => {
    const code = 'import { foo } from "bar";\nconst x = 42;\nexport default x;';
    const tokens = countTokens(code);
    expect(tokens).toBeGreaterThan(0);
  });
});

describe('estimateTokenBudget', () => {
  it('returns token, character, and line counts', () => {
    const result = estimateTokenBudget('line 1\nline 2\nline 3');
    expect(result.tokens).toBeGreaterThan(0);
    expect(result.lines).toBe(3);
    expect(result.characters).toBe(20);
  });
});
