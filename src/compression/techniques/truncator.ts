export interface TruncatorOptions {
  maxTokens: number;
  charsPerToken: number;
}

const DEFAULTS: TruncatorOptions = {
  maxTokens: 2000,
  charsPerToken: 4,
};

export function truncateContent(
  content: string,
  options: Partial<TruncatorOptions> = {}
): { result: string; applied: boolean } {
  const opts = { ...DEFAULTS, ...options };
  const maxChars = opts.maxTokens * opts.charsPerToken;

  if (content.length <= maxChars) {
    return { result: content, applied: false };
  }

  // Try to truncate at a line boundary
  const truncated = content.slice(0, maxChars);
  const lastNewline = truncated.lastIndexOf('\n');
  const cutPoint = lastNewline > maxChars * 0.5 ? lastNewline : maxChars;

  const remaining = content.length - cutPoint;
  const result = content.slice(0, cutPoint) + `\n\n[...truncated, ${remaining} characters remaining]`;

  return { result, applied: true };
}
