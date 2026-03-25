import { describe, it, expect } from 'vitest';
import { deduplicateLines } from '../../src/compression/techniques/dedup.js';
import { summarizeBlock } from '../../src/compression/techniques/summarizer.js';
import { truncateContent } from '../../src/compression/techniques/truncator.js';
import { stripComments } from '../../src/compression/techniques/comment-stripper.js';

describe('deduplicateLines', () => {
  it('removes repeated consecutive lines', () => {
    const input = 'line 1\nrepeated\nrepeated\nrepeated\nline 2';
    const { result, applied } = deduplicateLines(input);
    expect(applied).toBe(true);
    expect(result).toContain('repeated 2 more times');
    expect(result).toContain('line 1');
    expect(result).toContain('line 2');
  });

  it('does not modify content without repeats', () => {
    const input = 'line 1\nline 2\nline 3';
    const { result, applied } = deduplicateLines(input);
    expect(applied).toBe(false);
    expect(result).toBe(input);
  });
});

describe('summarizeBlock', () => {
  it('keeps short content unchanged', () => {
    const input = 'short content';
    const { result, applied } = summarizeBlock(input);
    expect(applied).toBe(false);
    expect(result).toBe(input);
  });

  it('summarizes long content', () => {
    const lines = Array.from({ length: 100 }, (_, i) => `line ${i}`);
    const input = lines.join('\n');
    const { result, applied } = summarizeBlock(input, { maxLines: 40 });
    expect(applied).toBe(true);
    expect(result).toContain('lines omitted');
  });
});

describe('truncateContent', () => {
  it('keeps short content unchanged', () => {
    const { result, applied } = truncateContent('short', { maxTokens: 100 });
    expect(applied).toBe(false);
    expect(result).toBe('short');
  });

  it('truncates long content', () => {
    const long = 'a'.repeat(10000);
    const { result, applied } = truncateContent(long, { maxTokens: 100 });
    expect(applied).toBe(true);
    expect(result).toContain('truncated');
    expect(result.length).toBeLessThan(long.length);
  });
});

describe('stripComments', () => {
  it('strips JS-style comments', () => {
    const input = '// comment\nconst x = 1; // inline\n/* block */\nconst y = 2;';
    const { result, applied } = stripComments(input, 'file.ts');
    expect(applied).toBe(true);
    expect(result).not.toContain('// comment');
    expect(result).toContain('const x = 1;');
    expect(result).toContain('const y = 2;');
  });

  it('strips Python-style comments', () => {
    const input = '# comment\nx = 1\n# another\ny = 2';
    const { result, applied } = stripComments(input, 'file.py');
    expect(applied).toBe(true);
    expect(result).toContain('x = 1');
  });

  it('returns unchanged for unknown languages', () => {
    const input = '-- sql comment\nSELECT 1;';
    const { applied } = stripComments(input, 'file.txt');
    expect(applied).toBe(false);
  });
});
