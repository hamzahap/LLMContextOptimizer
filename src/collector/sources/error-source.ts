import { readFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { SourceType, type CandidateContext, type CollectorOptions } from '../../types.js';
import { countTokens } from '../../token-counter.js';
import type { IContextSource } from '../source-registry.js';

export class ErrorSource implements IContextSource {
  type = SourceType.Error;

  async collect(options: CollectorOptions): Promise<CandidateContext[]> {
    if (!options.errors || options.errors.length === 0) return [];

    const cwd = options.cwd ?? process.cwd();
    const candidates: CandidateContext[] = [];

    for (const errorInput of options.errors) {
      // If it looks like a file path, read it; otherwise treat as inline error text
      if (looksLikeFilePath(errorInput)) {
        try {
          const absPath = resolve(cwd, errorInput);
          const content = await readFile(absPath, 'utf-8');
          const relPath = relative(cwd, absPath);

          candidates.push({
            id: `error:${relPath}`,
            source: SourceType.Error,
            path: relPath,
            content,
            metadata: {
              absolutePath: absPath,
              errorType: detectErrorType(content),
              hasStackTrace: hasStackTrace(content),
            },
            tokenCount: countTokens(content),
          });
        } catch {
          // Treat as inline error text on read failure
          candidates.push(createInlineError(errorInput, candidates.length));
        }
      } else {
        candidates.push(createInlineError(errorInput, candidates.length));
      }
    }

    return candidates;
  }
}

function createInlineError(content: string, index: number): CandidateContext {
  return {
    id: `error:inline-${index}`,
    source: SourceType.Error,
    content,
    metadata: {
      errorType: detectErrorType(content),
      hasStackTrace: hasStackTrace(content),
      inline: true,
    },
    tokenCount: countTokens(content),
  };
}

function looksLikeFilePath(input: string): boolean {
  return /\.[a-z]{1,5}$/i.test(input) && !input.includes('\n');
}

function detectErrorType(content: string): string {
  const match = content.match(/^(\w*Error|\w*Exception):/m);
  return match ? match[1] : 'unknown';
}

function hasStackTrace(content: string): boolean {
  return /at\s+\S+\s+\(/.test(content) || /Traceback\s+\(most\s+recent/i.test(content);
}
