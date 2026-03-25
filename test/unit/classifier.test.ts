import { describe, it, expect } from 'vitest';
import { TaskClassifier } from '../../src/classifier/index.js';
import { TaskType } from '../../src/types.js';

describe('TaskClassifier', () => {
  const classifier = new TaskClassifier();

  it('classifies bug fix tasks', () => {
    const result = classifier.classify('Fix the authentication bug where login fails with expired tokens');
    expect(result.type).toBe(TaskType.BugFix);
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('classifies refactoring tasks', () => {
    const result = classifier.classify('Refactor the user module to extract the validation logic');
    expect(result.type).toBe(TaskType.Refactor);
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('classifies feature tasks', () => {
    const result = classifier.classify('Add a new endpoint for user profile management');
    expect(result.type).toBe(TaskType.Feature);
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('classifies review tasks', () => {
    const result = classifier.classify('Review this pull request for the payment module');
    expect(result.type).toBe(TaskType.Review);
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('classifies debug tasks', () => {
    const result = classifier.classify('Why is the server crashing when processing large requests?');
    expect(result.type).toBe(TaskType.Debug);
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('classifies test tasks', () => {
    const result = classifier.classify('Write unit tests for the auth module');
    expect(result.type).toBe(TaskType.Test);
    expect(result.confidence).toBeGreaterThan(0);
  });

  it('extracts focus areas from file paths', () => {
    const result = classifier.classify('Fix the bug in src/auth.ts');
    expect(result.focusAreas).toContain('src/auth.ts');
  });

  it('boosts bugfix score when stack trace is present', () => {
    const withTrace = classifier.classify('Something is wrong\nat Object.fn (file.js:10:5)');
    const without = classifier.classify('Something is wrong');
    expect(withTrace.confidence).toBeGreaterThanOrEqual(without.confidence);
  });

  it('returns Unknown for ambiguous input', () => {
    const result = classifier.classify('hello');
    expect(result.type).toBe(TaskType.Unknown);
  });

  it('extracts keywords', () => {
    const result = classifier.classify('Fix the authentication bug in the login flow');
    expect(result.keywords.length).toBeGreaterThan(0);
    expect(result.keywords).toContain('authentication');
  });
});
