import { TaskType } from '../types.js';

export interface TaskPattern {
  keywords: string[];
  phrasePatterns: RegExp[];
  weight: number;
}

export const TASK_PATTERNS: Map<TaskType, TaskPattern> = new Map([
  [TaskType.BugFix, {
    keywords: ['bug', 'fix', 'broken', 'crash', 'error', 'fail', 'issue', 'wrong', 'incorrect', 'regression', 'patch', 'hotfix'],
    phrasePatterns: [
      /fix\s+(the\s+)?bug/i,
      /is\s+(broken|crashing|failing)/i,
      /not\s+working/i,
      /throws?\s+(an?\s+)?error/i,
      /unexpected\s+(behavior|result|output)/i,
      /should\s+(not|n't)\s+/i,
      /doesn't\s+work/i,
      /stack\s*trace/i,
    ],
    weight: 1.0,
  }],
  [TaskType.Refactor, {
    keywords: ['refactor', 'clean', 'restructure', 'reorganize', 'simplify', 'extract', 'rename', 'move', 'decouple', 'modularize'],
    phrasePatterns: [
      /refactor\s+/i,
      /clean\s*up/i,
      /extract\s+(into|to|a)/i,
      /rename\s+/i,
      /move\s+(to|into|from)/i,
      /simplify\s+(the\s+)?/i,
      /reduce\s+complexity/i,
      /improve\s+(code\s+)?quality/i,
    ],
    weight: 1.0,
  }],
  [TaskType.Feature, {
    keywords: ['add', 'implement', 'create', 'build', 'new', 'feature', 'support', 'enable', 'introduce', 'develop'],
    phrasePatterns: [
      /add\s+(a\s+)?(new\s+)?/i,
      /implement\s+/i,
      /create\s+(a\s+)?(new\s+)?/i,
      /build\s+(a\s+)?(new\s+)?/i,
      /new\s+feature/i,
      /add\s+support\s+for/i,
      /introduce\s+/i,
    ],
    weight: 1.0,
  }],
  [TaskType.Review, {
    keywords: ['review', 'check', 'audit', 'inspect', 'evaluate', 'assess', 'analyze', 'critique', 'feedback', 'pr'],
    phrasePatterns: [
      /review\s+(this|the|my)/i,
      /code\s+review/i,
      /pull\s+request/i,
      /give\s+(me\s+)?feedback/i,
      /what\s+do\s+you\s+think/i,
      /look\s+(at|over)\s+/i,
      /check\s+(this|the|my)/i,
    ],
    weight: 1.0,
  }],
  [TaskType.Documentation, {
    keywords: ['document', 'docs', 'readme', 'comment', 'jsdoc', 'docstring', 'explain', 'describe', 'annotate', 'wiki'],
    phrasePatterns: [
      /add\s+(a\s+)?comment/i,
      /write\s+(the\s+)?doc/i,
      /update\s+(the\s+)?readme/i,
      /add\s+(jsdoc|docstring|documentation)/i,
      /document\s+(this|the)/i,
    ],
    weight: 0.9,
  }],
  [TaskType.Test, {
    keywords: ['test', 'spec', 'coverage', 'jest', 'vitest', 'mocha', 'unittest', 'assert', 'expect', 'mock'],
    phrasePatterns: [
      /write\s+(a\s+)?test/i,
      /add\s+(a\s+)?test/i,
      /test\s+coverage/i,
      /unit\s+test/i,
      /integration\s+test/i,
      /fix\s+(the\s+)?test/i,
      /tests?\s+(are\s+)?failing/i,
    ],
    weight: 1.0,
  }],
  [TaskType.Debug, {
    keywords: ['debug', 'investigate', 'trace', 'diagnose', 'troubleshoot', 'why', 'cause', 'root'],
    phrasePatterns: [
      /debug\s+/i,
      /why\s+(is|does|did|are)/i,
      /investigate\s+/i,
      /root\s+cause/i,
      /figure\s+out\s+why/i,
      /what('s|\s+is)\s+causing/i,
      /troubleshoot/i,
    ],
    weight: 1.0,
  }],
  [TaskType.Exploration, {
    keywords: ['explore', 'understand', 'how', 'what', 'where', 'explain', 'learn', 'overview', 'architecture'],
    phrasePatterns: [
      /how\s+does\s+/i,
      /what\s+is\s+/i,
      /where\s+is\s+/i,
      /explain\s+(how|what|the)/i,
      /understand\s+/i,
      /walk\s+me\s+through/i,
      /give\s+(me\s+)?(an\s+)?overview/i,
    ],
    weight: 0.8,
  }],
]);
