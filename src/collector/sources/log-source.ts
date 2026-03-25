import { readFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { SourceType, type CandidateContext, type CollectorOptions } from '../../types.js';
import { countTokens } from '../../token-counter.js';
import type { IContextSource } from '../source-registry.js';

export class LogSource implements IContextSource {
  type = SourceType.Log;

  async collect(options: CollectorOptions): Promise<CandidateContext[]> {
    if (!options.logs || options.logs.length === 0) return [];

    const cwd = options.cwd ?? process.cwd();
    const candidates: CandidateContext[] = [];

    for (const logPath of options.logs) {
      try {
        const absPath = resolve(cwd, logPath);
        const content = await readFile(absPath, 'utf-8');
        const relPath = relative(cwd, absPath);

        candidates.push({
          id: `log:${relPath}`,
          source: SourceType.Log,
          path: relPath,
          content,
          metadata: {
            absolutePath: absPath,
            lines: content.split('\n').length,
            hasErrors: /(?:ERROR|FATAL|FAIL)/i.test(content),
            hasWarnings: /(?:WARN|WARNING)/i.test(content),
          },
          tokenCount: countTokens(content),
        });
      } catch {
        // Skip unreadable logs
      }
    }

    return candidates;
  }
}
