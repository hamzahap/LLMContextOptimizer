import { TaskType, type ITaskClassifier, type TaskProfile } from '../types.js';
import { TASK_PATTERNS } from './patterns.js';
import { applyHeuristics } from './heuristics.js';

export class TaskClassifier implements ITaskClassifier {
  classify(input: string, hints?: Record<string, unknown>): TaskProfile {
    const scores = new Map<TaskType, number>();
    const inputLower = input.toLowerCase();
    const inputWords = new Set(inputLower.split(/\s+/));

    // Score each task type based on keyword and pattern matches
    for (const [taskType, pattern] of TASK_PATTERNS) {
      let score = 0;

      // Keyword matching
      const matchedKeywords = pattern.keywords.filter(kw => inputLower.includes(kw));
      score += matchedKeywords.length * 0.15;

      // Phrase pattern matching
      const matchedPhrases = pattern.phrasePatterns.filter(p => p.test(input));
      score += matchedPhrases.length * 0.25;

      // Apply pattern weight
      score *= pattern.weight;

      scores.set(taskType, Math.min(score, 1.0));
    }

    // Apply heuristic boosts
    const boosts = applyHeuristics({ input, hints });
    for (const boost of boosts) {
      const current = scores.get(boost.taskType) ?? 0;
      scores.set(boost.taskType, Math.min(current + boost.boost, 1.0));
    }

    // Find the best match
    let bestType = TaskType.Unknown;
    let bestScore = 0;
    for (const [taskType, score] of scores) {
      if (score > bestScore) {
        bestType = taskType;
        bestScore = score;
      }
    }

    // Extract keywords from the input relevant to focus areas
    const focusAreas = extractFocusAreas(input);
    const keywords = extractKeywords(input, inputWords);

    return {
      type: bestType,
      confidence: Math.min(bestScore, 1.0),
      keywords,
      description: input.slice(0, 200),
      focusAreas,
    };
  }
}

function extractFocusAreas(input: string): string[] {
  const areas: string[] = [];

  // Extract quoted strings as focus areas
  const quoted = input.match(/["']([^"']+)["']/g);
  if (quoted) {
    areas.push(...quoted.map(q => q.slice(1, -1)));
  }

  // Extract file paths
  const paths = input.match(/\b[\w/.-]+\.(ts|js|py|java|go|rs|cpp|c|rb|php)\b/g);
  if (paths) {
    areas.push(...paths);
  }

  // Extract function/class names (CamelCase or snake_case identifiers)
  const identifiers = input.match(/\b[A-Z][a-zA-Z0-9]+\b/g);
  if (identifiers) {
    areas.push(...identifiers.filter(id =>
      !['Error', 'TypeError', 'The', 'This', 'That', 'When', 'What', 'How', 'Why'].includes(id)
    ));
  }

  return [...new Set(areas)].slice(0, 10);
}

function extractKeywords(input: string, _words: Set<string>): string[] {
  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
    'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
    'would', 'could', 'should', 'may', 'might', 'can', 'shall',
    'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from',
    'it', 'this', 'that', 'these', 'those', 'i', 'me', 'my',
    'we', 'our', 'you', 'your', 'he', 'she', 'they', 'them',
    'and', 'or', 'but', 'not', 'so', 'if', 'then', 'else',
    'when', 'where', 'how', 'what', 'which', 'who', 'whom',
  ]);

  const words = input.toLowerCase().split(/\s+/)
    .map(w => w.replace(/[^a-z0-9_-]/g, ''))
    .filter(w => w.length > 2 && !stopWords.has(w));

  // Count frequency
  const freq = new Map<string, number>();
  for (const w of words) {
    freq.set(w, (freq.get(w) ?? 0) + 1);
  }

  // Sort by frequency, return top keywords
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([word]) => word);
}

export { TaskClassifier as default };
