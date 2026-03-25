export interface SummarizerOptions {
  maxLines: number;
  keepFirst: number;
  keepLast: number;
}

const DEFAULTS: SummarizerOptions = {
  maxLines: 50,
  keepFirst: 15,
  keepLast: 15,
};

export function summarizeBlock(
  content: string,
  options: Partial<SummarizerOptions> = {}
): { result: string; applied: boolean } {
  const opts = { ...DEFAULTS, ...options };
  const lines = content.split('\n');

  if (lines.length <= opts.maxLines) {
    return { result: content, applied: false };
  }

  const first = lines.slice(0, opts.keepFirst);
  const last = lines.slice(-opts.keepLast);
  const omitted = lines.length - opts.keepFirst - opts.keepLast;

  const result = [
    ...first,
    ``,
    `[...${omitted} lines omitted]`,
    ``,
    ...last,
  ].join('\n');

  return { result, applied: true };
}
