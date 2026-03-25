import { SourceType, type CandidateContext, type CollectorOptions } from '../../types.js';
import { countTokens } from '../../token-counter.js';
import type { IContextSource } from '../source-registry.js';

export class DiffSource implements IContextSource {
  type = SourceType.Diff;

  async collect(options: CollectorOptions): Promise<CandidateContext[]> {
    const candidates: CandidateContext[] = [];

    if (!options.diffs || options.diffs.length === 0) {
      return candidates;
    }

    for (let i = 0; i < options.diffs.length; i++) {
      const diffContent = options.diffs[i];
      const parsed = parseDiff(diffContent);

      candidates.push({
        id: `diff:${i}`,
        source: SourceType.Diff,
        path: parsed.files.join(', '),
        content: diffContent,
        metadata: {
          filesChanged: parsed.files,
          additions: parsed.additions,
          deletions: parsed.deletions,
        },
        tokenCount: countTokens(diffContent),
      });
    }

    return candidates;
  }
}

interface ParsedDiff {
  files: string[];
  additions: number;
  deletions: number;
}

function parseDiff(diff: string): ParsedDiff {
  const files: string[] = [];
  let additions = 0;
  let deletions = 0;

  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ b/')) {
      files.push(line.slice(6));
    } else if (line.startsWith('+') && !line.startsWith('+++')) {
      additions++;
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      deletions++;
    }
  }

  return { files, additions, deletions };
}
