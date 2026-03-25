import { SourceType, type CompressedContext, type ContextSection, type TaskProfile } from '../types.js';
import { countTokens } from '../token-counter.js';

export function buildSections(
  included: CompressedContext[],
  task: TaskProfile
): ContextSection[] {
  const sections: ContextSection[] = [];

  // 1. Task section
  const taskContent = buildTaskSection(task);
  sections.push({
    role: 'task',
    label: 'Task Description',
    content: taskContent,
    tokenCount: countTokens(taskContent),
    sources: [],
  });

  // 2. Error/evidence section (exact evidence)
  const errors = included.filter(c =>
    c.source === SourceType.Error ||
    (c.source === SourceType.Log && c.metadata['hasErrors'] === true)
  );
  if (errors.length > 0) {
    const content = errors.map(e => {
      const header = e.path ? `--- ${e.path} ---` : `--- Error ${e.id} ---`;
      return `${header}\n${e.compressedContent}`;
    }).join('\n\n');

    sections.push({
      role: 'context',
      label: 'Exact Evidence (Errors, Stack Traces, Test Failures)',
      content,
      tokenCount: countTokens(content),
      sources: errors.map(e => e.id),
    });
  }

  // 3. Diff section
  const diffs = included.filter(c => c.source === SourceType.Diff);
  if (diffs.length > 0) {
    const content = diffs.map(d => d.compressedContent).join('\n\n');
    sections.push({
      role: 'context',
      label: 'Recent Changes (Diffs)',
      content,
      tokenCount: countTokens(content),
      sources: diffs.map(d => d.id),
    });
  }

  // 4. Files section
  const files = included.filter(c => c.source === SourceType.File);
  if (files.length > 0) {
    const content = files.map(f => {
      const path = f.path ?? f.id;
      return `--- ${path} ---\n${f.compressedContent}`;
    }).join('\n\n');

    sections.push({
      role: 'context',
      label: 'Relevant Source Files',
      content,
      tokenCount: countTokens(content),
      sources: files.map(f => f.id),
    });
  }

  // 5. Chat/background section
  const chat = included.filter(c => c.source === SourceType.Chat);
  if (chat.length > 0) {
    const content = chat.map(c => {
      const role = (c.metadata['role'] as string) ?? 'unknown';
      return `[${role}]: ${c.compressedContent}`;
    }).join('\n\n');

    sections.push({
      role: 'reference',
      label: 'Conversation History',
      content,
      tokenCount: countTokens(content),
      sources: chat.map(c => c.id),
    });
  }

  // 6. Logs section
  const logs = included.filter(c =>
    c.source === SourceType.Log && c.metadata['hasErrors'] !== true
  );
  if (logs.length > 0) {
    const content = logs.map(l => {
      const path = l.path ?? l.id;
      return `--- ${path} ---\n${l.compressedContent}`;
    }).join('\n\n');

    sections.push({
      role: 'reference',
      label: 'Log Output',
      content,
      tokenCount: countTokens(content),
      sources: logs.map(l => l.id),
    });
  }

  return sections;
}

function buildTaskSection(task: TaskProfile): string {
  const lines = [
    `Task: ${task.description}`,
    `Type: ${task.type}`,
    `Confidence: ${(task.confidence * 100).toFixed(0)}%`,
  ];

  if (task.focusAreas.length > 0) {
    lines.push(`Focus Areas: ${task.focusAreas.join(', ')}`);
  }

  if (task.keywords.length > 0) {
    lines.push(`Keywords: ${task.keywords.slice(0, 10).join(', ')}`);
  }

  return lines.join('\n');
}
