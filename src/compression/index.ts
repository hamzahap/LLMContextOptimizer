import { ProtectionLevel, type ICompressionEngine, type ScoredContext, type CompressedContext, type TaskProfile } from '../types.js';
import { countTokens } from '../token-counter.js';
import { deduplicateLines } from './techniques/dedup.js';
import { summarizeBlock } from './techniques/summarizer.js';
import { truncateContent } from './techniques/truncator.js';
import { stripComments } from './techniques/comment-stripper.js';

export interface CompressionConfig {
  level: 'light' | 'moderate' | 'aggressive';
  relevanceThreshold: number; // Only compress below this score
  maxTokensPerItem: number;
}

const LEVEL_CONFIGS: Record<string, CompressionConfig> = {
  light: { level: 'light', relevanceThreshold: 0.3, maxTokensPerItem: 3000 },
  moderate: { level: 'moderate', relevanceThreshold: 0.5, maxTokensPerItem: 2000 },
  aggressive: { level: 'aggressive', relevanceThreshold: 0.7, maxTokensPerItem: 1000 },
};

export class CompressionEngine implements ICompressionEngine {
  private config: CompressionConfig;

  constructor(level: 'light' | 'moderate' | 'aggressive' = 'moderate') {
    this.config = LEVEL_CONFIGS[level];
  }

  compress(contexts: ScoredContext[], _task: TaskProfile): CompressedContext[] {
    return contexts.map(ctx => this.compressOne(ctx));
  }

  private compressOne(ctx: ScoredContext): CompressedContext {
    const techniques: string[] = [];
    let content = ctx.content;
    const originalTokens = ctx.tokenCount;

    // High-relevance items get minimal compression
    if (ctx.relevanceScore >= this.config.relevanceThreshold) {
      return {
        ...ctx,
        originalTokenCount: originalTokens,
        compressedContent: content,
        compressionRatio: 1.0,
        techniquesApplied: [],
        protectionLevel: ProtectionLevel.Normal,
      };
    }

    // Apply deduplication
    const dedup = deduplicateLines(content);
    if (dedup.applied) {
      content = dedup.result;
      techniques.push('dedup');
    }

    // Strip comments from low-relevance code files
    if (ctx.path && ctx.relevanceScore < this.config.relevanceThreshold * 0.5) {
      const stripped = stripComments(content, ctx.path);
      if (stripped.applied) {
        content = stripped.result;
        techniques.push('comment-strip');
      }
    }

    // Summarize long blocks
    const maxLines = this.config.level === 'aggressive' ? 30 : this.config.level === 'moderate' ? 50 : 80;
    const summarized = summarizeBlock(content, { maxLines });
    if (summarized.applied) {
      content = summarized.result;
      techniques.push('summarize');
    }

    // Truncate if still too large
    const truncated = truncateContent(content, { maxTokens: this.config.maxTokensPerItem });
    if (truncated.applied) {
      content = truncated.result;
      techniques.push('truncate');
    }

    const newTokenCount = countTokens(content);
    return {
      ...ctx,
      originalTokenCount: originalTokens,
      compressedContent: content,
      compressionRatio: originalTokens > 0 ? newTokenCount / originalTokens : 1,
      techniquesApplied: techniques,
      tokenCount: newTokenCount,
      protectionLevel: ProtectionLevel.Normal,
    };
  }
}
