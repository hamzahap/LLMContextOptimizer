import type { ContextBundle, AuditLog } from '../../types.js';

export function formatJson(bundle: ContextBundle, auditLog?: AuditLog): string {
  const output = {
    bundle: {
      sections: bundle.sections.map(s => ({
        role: s.role,
        label: s.label,
        tokenCount: s.tokenCount,
        sources: s.sources,
        content: s.content,
      })),
      totalTokens: bundle.totalTokens,
      budgetUsed: `${bundle.budgetUsed.toFixed(1)}%`,
      metadata: bundle.metadata,
    },
    audit: auditLog ? {
      summary: auditLog.summary,
      decisions: auditLog.entries,
    } : undefined,
  };

  return JSON.stringify(output, null, 2);
}
