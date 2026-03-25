import { TaskType, SourceType, type CandidateContext, type TaskProfile } from '../../types.js';

// Defines how much each source type matters for each task type
const AFFINITY_MAP: Record<string, Record<string, number>> = {
  [TaskType.BugFix]: {
    [SourceType.Error]: 1.0,
    [SourceType.Log]: 0.8,
    [SourceType.File]: 0.7,
    [SourceType.Diff]: 0.6,
    [SourceType.Chat]: 0.3,
  },
  [TaskType.Debug]: {
    [SourceType.Error]: 1.0,
    [SourceType.Log]: 0.9,
    [SourceType.File]: 0.6,
    [SourceType.Diff]: 0.5,
    [SourceType.Chat]: 0.3,
  },
  [TaskType.Refactor]: {
    [SourceType.File]: 1.0,
    [SourceType.Diff]: 0.5,
    [SourceType.Error]: 0.2,
    [SourceType.Log]: 0.1,
    [SourceType.Chat]: 0.3,
  },
  [TaskType.Feature]: {
    [SourceType.File]: 0.9,
    [SourceType.Chat]: 0.5,
    [SourceType.Diff]: 0.4,
    [SourceType.Error]: 0.2,
    [SourceType.Log]: 0.1,
  },
  [TaskType.Review]: {
    [SourceType.Diff]: 1.0,
    [SourceType.File]: 0.8,
    [SourceType.Error]: 0.4,
    [SourceType.Log]: 0.3,
    [SourceType.Chat]: 0.4,
  },
  [TaskType.Test]: {
    [SourceType.Error]: 0.9,
    [SourceType.File]: 0.9,
    [SourceType.Log]: 0.5,
    [SourceType.Diff]: 0.4,
    [SourceType.Chat]: 0.2,
  },
  [TaskType.Documentation]: {
    [SourceType.File]: 0.8,
    [SourceType.Chat]: 0.6,
    [SourceType.Diff]: 0.3,
    [SourceType.Error]: 0.1,
    [SourceType.Log]: 0.1,
  },
  [TaskType.Exploration]: {
    [SourceType.File]: 0.8,
    [SourceType.Chat]: 0.7,
    [SourceType.Diff]: 0.4,
    [SourceType.Log]: 0.3,
    [SourceType.Error]: 0.3,
  },
};

const DEFAULT_AFFINITY = 0.5;

export function scoreByTaskAffinity(candidate: CandidateContext, task: TaskProfile): number {
  const taskAffinities = AFFINITY_MAP[task.type];
  if (!taskAffinities) return DEFAULT_AFFINITY;

  return taskAffinities[candidate.source] ?? DEFAULT_AFFINITY;
}
