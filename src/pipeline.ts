import type {
  OptimizerConfig,
  CollectorOptions,
  ContextBundle,
  AuditLog,
  ITaskClassifier,
  IContextCollector,
  IRelevanceRanker,
  ICompressionEngine,
  ILosslessRulesEngine,
  IContextPacker,
  IAuditLayer,
} from './types.js';
import { resolveConfig } from './config.js';
import { TaskClassifier } from './classifier/index.js';
import { ContextCollector } from './collector/index.js';
import { RelevanceRanker } from './ranker/index.js';
import { CompressionEngine } from './compression/index.js';
import { LosslessRulesEngine } from './rules/index.js';
import { ContextPacker } from './packer/index.js';
import { AuditLayer } from './audit/index.js';

export interface PipelineResult {
  bundle: ContextBundle;
  auditLog: AuditLog;
}

export class OptimizePipeline {
  private classifier: ITaskClassifier;
  private collector: IContextCollector;
  private ranker: IRelevanceRanker;
  private compression: ICompressionEngine;
  private rules: ILosslessRulesEngine;
  private packer: IContextPacker;
  private audit: IAuditLayer;
  private config: OptimizerConfig;

  constructor(
    config: OptimizerConfig,
    modules?: {
      classifier?: ITaskClassifier;
      collector?: IContextCollector;
      ranker?: IRelevanceRanker;
      compression?: ICompressionEngine;
      rules?: ILosslessRulesEngine;
      packer?: IContextPacker;
      audit?: IAuditLayer;
    }
  ) {
    this.config = config;
    this.classifier = modules?.classifier ?? new TaskClassifier();
    this.collector = modules?.collector ?? new ContextCollector();
    this.ranker = modules?.ranker ?? new RelevanceRanker(config.strategyWeights);
    this.compression = modules?.compression ?? new CompressionEngine(config.compressionLevel ?? 'moderate');
    this.rules = modules?.rules ?? new LosslessRulesEngine();
    this.packer = modules?.packer ?? new ContextPacker();
    this.audit = modules?.audit ?? new AuditLayer();
  }

  async run(taskDescription: string, collectorOptions: CollectorOptions): Promise<PipelineResult> {
    this.audit.reset();

    // 1. Classify the task
    const taskProfile = this.classifier.classify(taskDescription);

    // 2. Collect candidate context
    const candidates = await this.collector.collect(collectorOptions);

    // 3. Rank by relevance
    const scored = this.ranker.rank(candidates, taskProfile);

    // 4. Compress low-priority context
    const compressed = this.compression.compress(scored, taskProfile);

    // 5. Apply lossless protection rules
    const protected_ = this.rules.protect(compressed);

    // 6. Record audit entries
    for (const ctx of protected_) {
      const wasCompressed = ctx.techniquesApplied.length > 0;
      this.audit.record({
        contextId: ctx.id,
        decision: wasCompressed ? 'compressed' : 'included',
        reason: wasCompressed
          ? `Compressed with: ${ctx.techniquesApplied.join(', ')} (relevance: ${ctx.relevanceScore.toFixed(2)}, protection: ${ctx.protectionLevel})`
          : `Included (relevance: ${ctx.relevanceScore.toFixed(2)}, protection: ${ctx.protectionLevel})`,
        relevanceScore: ctx.relevanceScore,
        tokensBefore: ctx.originalTokenCount,
        tokensAfter: ctx.tokenCount,
      });
    }

    // 7. Pack into budget
    const bundle = this.packer.pack(protected_, this.config.tokenBudget, taskProfile);

    // Record exclusions
    const includedIds = new Set(bundle.sections.flatMap(s => s.sources));
    for (const ctx of protected_) {
      if (!includedIds.has(ctx.id)) {
        this.audit.record({
          contextId: ctx.id,
          decision: 'excluded',
          reason: `Excluded: didn't fit in token budget (relevance: ${ctx.relevanceScore.toFixed(2)}, tokens: ${ctx.tokenCount})`,
          relevanceScore: ctx.relevanceScore,
          tokensBefore: ctx.originalTokenCount,
        });
      }
    }

    // 8. Finalize audit
    const auditLog = this.audit.finalize(taskProfile, this.config.tokenBudget);

    return { bundle, auditLog };
  }
}

export function createPipeline(config?: Partial<OptimizerConfig>): OptimizePipeline {
  return new OptimizePipeline(resolveConfig(config));
}
