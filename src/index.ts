// Public API
export { OptimizePipeline, createPipeline } from './pipeline.js';
export type { PipelineResult } from './pipeline.js';

// Types
export {
  TaskType,
  SourceType,
  ProtectionLevel,
} from './types.js';
export type {
  TaskProfile,
  CandidateContext,
  ScoredContext,
  CompressedContext,
  ContextBundle,
  ContextSection,
  BundleMetadata,
  AuditEntry,
  AuditLog,
  AuditSummary,
  CollectorOptions,
  OptimizerConfig,
  ITaskClassifier,
  IContextCollector,
  IRelevanceRanker,
  ICompressionEngine,
  ILosslessRulesEngine,
  IContextPacker,
  IAuditLayer,
} from './types.js';

// Config
export { resolveConfig, DEFAULT_CONFIG } from './config.js';

// Utilities
export { countTokens, estimateTokenBudget } from './token-counter.js';

// Modules (for advanced usage / custom pipelines)
export { TaskClassifier } from './classifier/index.js';
export { ContextCollector } from './collector/index.js';
export { SourceRegistry } from './collector/source-registry.js';
export { RelevanceRanker } from './ranker/index.js';
export { CompressionEngine } from './compression/index.js';
export { LosslessRulesEngine } from './rules/index.js';
export { ContextPacker } from './packer/index.js';
export { AuditLayer, formatAuditSummary } from './audit/index.js';
