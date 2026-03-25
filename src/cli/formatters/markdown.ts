import type { ContextBundle, AuditLog } from '../../types.js';

export function formatMarkdown(bundle: ContextBundle, auditLog?: AuditLog): string {
  const lines: string[] = [];
  const meta = bundle.metadata;

  lines.push('# Context Optimization Result');
  lines.push('');
  lines.push(`**Task:** ${meta.taskProfile.description}`);
  lines.push(`**Type:** ${meta.taskProfile.type} (${(meta.taskProfile.confidence * 100).toFixed(0)}% confidence)`);
  lines.push(`**Token Budget:** ${meta.tokenBudget} | **Used:** ${bundle.totalTokens} (${bundle.budgetUsed.toFixed(1)}%)`);
  lines.push(`**Candidates:** ${meta.totalCandidates} | **Included:** ${meta.includedCount} | **Excluded:** ${meta.excludedCount}`);
  lines.push(`**Tokens Saved:** ${meta.compressionSavings}`);
  lines.push('');

  for (const section of bundle.sections) {
    lines.push(`## ${section.label}`);
    lines.push(`*Role: ${section.role} | Tokens: ${section.tokenCount} | Sources: ${section.sources.length}*`);
    lines.push('');
    lines.push('```');
    lines.push(section.content);
    lines.push('```');
    lines.push('');
  }

  if (auditLog) {
    lines.push('## Audit Log');
    lines.push('');
    lines.push(`| Decision | Context ID | Relevance | Tokens |`);
    lines.push(`|----------|-----------|-----------|--------|`);

    for (const entry of auditLog.entries) {
      const score = entry.relevanceScore !== undefined ? entry.relevanceScore.toFixed(2) : '-';
      const tokens = entry.tokensBefore !== undefined
        ? `${entry.tokensBefore}→${entry.tokensAfter ?? entry.tokensBefore}`
        : '-';
      lines.push(`| ${entry.decision} | ${entry.contextId} | ${score} | ${tokens} |`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
