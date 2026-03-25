import type { IContextPacker, CompressedContext, ContextBundle, TaskProfile } from '../types.js';
import { packItems } from './bin-packing.js';
import { buildSections } from './section-builder.js';

export class ContextPacker implements IContextPacker {
  pack(contexts: CompressedContext[], budget: number, task: TaskProfile): ContextBundle {
    const { included, excluded } = packItems(contexts, budget);
    const sections = buildSections(included, task);

    const totalTokens = sections.reduce((sum, s) => sum + s.tokenCount, 0);
    const compressionSavings = contexts.reduce(
      (sum, c) => sum + (c.originalTokenCount - c.tokenCount), 0
    );

    return {
      sections,
      totalTokens,
      budgetUsed: budget > 0 ? (totalTokens / budget) * 100 : 0,
      metadata: {
        taskProfile: task,
        tokenBudget: budget,
        totalCandidates: contexts.length,
        includedCount: included.length,
        excludedCount: excluded.length,
        compressionSavings,
      },
    };
  }
}
