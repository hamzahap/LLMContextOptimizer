import { ProtectionLevel, type ILosslessRulesEngine, type CompressedContext } from '../types.js';
import { BUILT_IN_RULES, type LosslessRule } from './built-in-rules.js';
import { evaluateRules } from './rule-evaluator.js';

export class LosslessRulesEngine implements ILosslessRulesEngine {
  private rules: LosslessRule[];

  constructor(additionalRules?: LosslessRule[]) {
    this.rules = [...BUILT_IN_RULES, ...(additionalRules ?? [])];
  }

  evaluate(context: CompressedContext): ProtectionLevel {
    return evaluateRules(context, this.rules);
  }

  protect(contexts: CompressedContext[]): CompressedContext[] {
    return contexts.map(ctx => {
      const level = this.evaluate(ctx);
      const protected_ = { ...ctx, protectionLevel: level };

      // If immutable and was compressed, restore original content
      if (level === ProtectionLevel.Immutable && ctx.techniquesApplied.length > 0) {
        protected_.compressedContent = ctx.content;
        protected_.tokenCount = ctx.originalTokenCount;
        protected_.compressionRatio = 1.0;
        protected_.techniquesApplied = [];
      }

      return protected_;
    });
  }
}
