import type { ContextBundle, AuditLog } from '../../types.js';
import { formatJson } from './json.js';
import { formatMarkdown } from './markdown.js';
import { formatText } from './text.js';

export type OutputFormat = 'json' | 'markdown' | 'text';

export function formatOutput(
  format: OutputFormat,
  bundle: ContextBundle,
  auditLog?: AuditLog
): string {
  switch (format) {
    case 'json':
      return formatJson(bundle, auditLog);
    case 'markdown':
      return formatMarkdown(bundle, auditLog);
    case 'text':
      return formatText(bundle, auditLog);
    default:
      return formatJson(bundle, auditLog);
  }
}

export { formatJson, formatMarkdown, formatText };
