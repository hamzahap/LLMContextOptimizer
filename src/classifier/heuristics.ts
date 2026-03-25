import { TaskType } from '../types.js';

export interface HeuristicInput {
  input: string;
  hints?: Record<string, unknown>;
}

export interface HeuristicBoost {
  taskType: TaskType;
  boost: number;
  reason: string;
}

export function applyHeuristics(input: HeuristicInput): HeuristicBoost[] {
  const boosts: HeuristicBoost[] = [];
  const text = input.input;
  const hints = input.hints ?? {};

  // Stack trace presence strongly suggests BugFix or Debug
  if (hasStackTrace(text)) {
    boosts.push({ taskType: TaskType.BugFix, boost: 0.3, reason: 'stack trace detected' });
    boosts.push({ taskType: TaskType.Debug, boost: 0.2, reason: 'stack trace detected' });
  }

  // Error messages suggest BugFix
  if (hasErrorMessages(text)) {
    boosts.push({ taskType: TaskType.BugFix, boost: 0.2, reason: 'error message detected' });
  }

  // Test file references suggest Test task
  if (hasTestReferences(text)) {
    boosts.push({ taskType: TaskType.Test, boost: 0.25, reason: 'test file references detected' });
  }

  // Diff content suggests Review
  if (hasDiffContent(text)) {
    boosts.push({ taskType: TaskType.Review, boost: 0.15, reason: 'diff content detected' });
  }

  // Question marks suggest Exploration or Debug
  if (hasQuestions(text)) {
    boosts.push({ taskType: TaskType.Exploration, boost: 0.1, reason: 'question detected' });
    boosts.push({ taskType: TaskType.Debug, boost: 0.1, reason: 'question detected' });
  }

  // Hint-based boosts
  if (hints.hasFailingTests) {
    boosts.push({ taskType: TaskType.BugFix, boost: 0.2, reason: 'failing tests hint' });
  }
  if (hints.hasDiff) {
    boosts.push({ taskType: TaskType.Review, boost: 0.15, reason: 'diff present hint' });
  }

  return boosts;
}

function hasStackTrace(text: string): boolean {
  return /at\s+\S+\s+\(/.test(text) || /Traceback\s+\(most\s+recent/i.test(text);
}

function hasErrorMessages(text: string): boolean {
  return /(?:Error|Exception|FATAL|FAIL):/i.test(text);
}

function hasTestReferences(text: string): boolean {
  return /\.(test|spec)\.(ts|js|tsx|jsx|py)/.test(text) || /(?:describe|it|test)\s*\(/.test(text);
}

function hasDiffContent(text: string): boolean {
  return /^[+-]{3}\s/m.test(text) || /^@@\s/m.test(text);
}

function hasQuestions(text: string): boolean {
  return /\?\s*$/.test(text.trim());
}
