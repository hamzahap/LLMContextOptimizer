import { readFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { glob } from 'glob';
import { SourceType, type CandidateContext, type CollectorOptions } from '../../types.js';
import { countTokens } from '../../token-counter.js';
import type { IContextSource } from '../source-registry.js';

export class FileSource implements IContextSource {
  type = SourceType.File;

  async collect(options: CollectorOptions): Promise<CandidateContext[]> {
    const cwd = options.cwd ?? process.cwd();
    const filePaths = new Set<string>();

    // Collect explicit file paths
    if (options.files) {
      for (const f of options.files) {
        filePaths.add(resolve(cwd, f));
      }
    }

    // Collect glob patterns
    if (options.globs) {
      for (const pattern of options.globs) {
        const matches = await glob(pattern, { cwd, absolute: true, nodir: true });
        for (const m of matches) {
          filePaths.add(m);
        }
      }
    }

    const candidates: CandidateContext[] = [];

    for (const filePath of filePaths) {
      try {
        const content = await readFile(filePath, 'utf-8');
        const relPath = relative(cwd, filePath);
        const tokens = countTokens(content, filePath);

        candidates.push({
          id: `file:${relPath}`,
          source: SourceType.File,
          path: relPath,
          content,
          metadata: {
            absolutePath: filePath,
            size: content.length,
            lines: content.split('\n').length,
          },
          tokenCount: tokens,
        });
      } catch {
        // Skip files that can't be read
      }
    }

    return candidates;
  }
}
