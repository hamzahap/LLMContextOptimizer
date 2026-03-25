import type { ContextBundle, AuditLog } from '../../types.js';

export function formatText(bundle: ContextBundle, auditLog?: AuditLog): string {
  const lines: string[] = [];
  const meta = bundle.metadata;

  lines.push('========================================');
  lines.push('  LLM Context Optimizer - Result');
  lines.push('========================================');
  lines.push('');
  lines.push(`Task:       ${meta.taskProfile.description}`);
  lines.push(`Type:       ${meta.taskProfile.type} (${(meta.taskProfile.confidence * 100).toFixed(0)}% confidence)`);
  lines.push(`Budget:     ${meta.tokenBudget} tokens`);
  lines.push(`Used:       ${bundle.totalTokens} tokens (${bundle.budgetUsed.toFixed(1)}%)`);
  lines.push(`Saved:      ${meta.compressionSavings} tokens`);
  lines.push(`Included:   ${meta.includedCount} / ${meta.totalCandidates} candidates`);
  lines.push('');

  for (const section of bundle.sections) {
    lines.push(`--- ${section.label} (${section.tokenCount} tokens) ---`);
    lines.push(section.content);
    lines.push('');
  }

  if (auditLog) {
    lines.push('--- Audit Summary ---');
    const s = auditLog.summary;
    lines.push(`  Total: ${s.totalCandidates} | Included: ${s.included} | Excluded: ${s.excluded} | Compressed: ${s.compressed}`);
    lines.push(`  Tokens: ${s.tokensUsed}/${s.tokenBudget} used, ${s.tokensSaved} saved`);
    lines.push('');

    for (const entry of auditLog.entries) {
      lines.push(`  [${entry.decision.toUpperCase().padEnd(10)}] ${entry.contextId}`);
      lines.push(`    ${entry.reason}`);
    }
  }

  return lines.join('\n');
}
