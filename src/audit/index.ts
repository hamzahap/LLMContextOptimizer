import type { IAuditLayer, AuditEntry, AuditLog, AuditSummary, TaskProfile } from '../types.js';

export class AuditLayer implements IAuditLayer {
  private entries: AuditEntry[] = [];
  private log: AuditLog | null = null;

  record(entry: AuditEntry): void {
    this.entries.push(entry);
  }

  finalize(task: TaskProfile, budget: number): AuditLog {
    const summary = this.buildSummary(budget);
    this.log = {
      timestamp: new Date(),
      taskProfile: task,
      entries: [...this.entries],
      summary,
    };
    return this.log;
  }

  getLog(): AuditLog | null {
    return this.log;
  }

  reset(): void {
    this.entries = [];
    this.log = null;
  }

  private buildSummary(budget: number): AuditSummary {
    let included = 0;
    let excluded = 0;
    let compressed = 0;
    let tokensUsed = 0;
    let tokensSaved = 0;

    for (const entry of this.entries) {
      switch (entry.decision) {
        case 'included':
          included++;
          tokensUsed += entry.tokensAfter ?? entry.tokensBefore ?? 0;
          break;
        case 'excluded':
          excluded++;
          tokensSaved += entry.tokensBefore ?? 0;
          break;
        case 'compressed':
          compressed++;
          tokensUsed += entry.tokensAfter ?? 0;
          tokensSaved += (entry.tokensBefore ?? 0) - (entry.tokensAfter ?? 0);
          break;
      }
    }

    return {
      totalCandidates: this.entries.length,
      included,
      excluded,
      compressed,
      tokenBudget: budget,
      tokensUsed,
      tokensSaved,
    };
  }
}

export function formatAuditSummary(log: AuditLog): string {
  const s = log.summary;
  const lines = [
    '=== Context Optimization Audit ===',
    `Task: ${log.taskProfile.description.slice(0, 100)}`,
    `Type: ${log.taskProfile.type} (confidence: ${(log.taskProfile.confidence * 100).toFixed(0)}%)`,
    '',
    '--- Summary ---',
    `Total candidates: ${s.totalCandidates}`,
    `Included: ${s.included}`,
    `Excluded: ${s.excluded}`,
    `Compressed: ${s.compressed}`,
    `Token budget: ${s.tokenBudget}`,
    `Tokens used: ${s.tokensUsed} (${((s.tokensUsed / s.tokenBudget) * 100).toFixed(1)}%)`,
    `Tokens saved: ${s.tokensSaved}`,
    '',
    '--- Decisions ---',
  ];

  for (const entry of log.entries) {
    const tokens = entry.tokensBefore
      ? ` [${entry.tokensBefore}→${entry.tokensAfter ?? entry.tokensBefore} tokens]`
      : '';
    lines.push(`  [${entry.decision.toUpperCase()}] ${entry.contextId}${tokens}`);
    lines.push(`    Reason: ${entry.reason}`);
  }

  return lines.join('\n');
}
