import type { OptimizerConfig } from './types.js';

export const DEFAULT_CONFIG: OptimizerConfig = {
  tokenBudget: 8000,
  model: 'gpt-4',
  strategyWeights: {
    keyword: 0.4,
    recency: 0.2,
    dependency: 0.2,
    taskAffinity: 0.2,
  },
  losslessPatterns: [
    'Error:',
    'at\\s+\\S+\\s+\\(',
    'FAIL',
    'AssertionError',
    'TypeError',
    'ReferenceError',
    'SyntaxError',
  ],
  compressionLevel: 'moderate',
  outputFormat: 'json',
  auditLog: true,
};

export function resolveConfig(partial: Partial<OptimizerConfig> = {}): OptimizerConfig {
  return {
    ...DEFAULT_CONFIG,
    ...partial,
    strategyWeights: {
      ...DEFAULT_CONFIG.strategyWeights,
      ...partial.strategyWeights,
    },
  };
}
