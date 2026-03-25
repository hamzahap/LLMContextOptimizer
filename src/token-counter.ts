/**
 * Simple token counter that estimates token count based on character/word heuristics.
 * Uses the ~4 characters per token approximation for English text.
 * For code, uses a slightly different ratio (~3.5 chars per token).
 */

const CODE_EXTENSIONS = new Set([
  '.ts', '.js', '.tsx', '.jsx', '.py', '.java', '.go', '.rs',
  '.c', '.cpp', '.h', '.hpp', '.cs', '.rb', '.php', '.swift',
  '.kt', '.scala', '.sh', '.bash', '.zsh', '.sql', '.json',
  '.yaml', '.yml', '.toml', '.xml', '.html', '.css', '.scss',
]);

export function countTokens(text: string, filePath?: string): number {
  if (!text) return 0;

  const isCode = filePath ? CODE_EXTENSIONS.has(extname(filePath)) : looksLikeCode(text);
  const charsPerToken = isCode ? 3.5 : 4.0;

  return Math.ceil(text.length / charsPerToken);
}

function extname(path: string): string {
  const dot = path.lastIndexOf('.');
  return dot >= 0 ? path.slice(dot) : '';
}

function looksLikeCode(text: string): boolean {
  const codeIndicators = [
    /^import\s/m,
    /^export\s/m,
    /^function\s/m,
    /^class\s/m,
    /^const\s/m,
    /^let\s/m,
    /^var\s/m,
    /^\s*if\s*\(/m,
    /^\s*for\s*\(/m,
    /^\s*def\s/m,
    /[{};]\s*$/m,
    /=>/,
  ];
  let matches = 0;
  for (const pattern of codeIndicators) {
    if (pattern.test(text)) matches++;
    if (matches >= 2) return true;
  }
  return false;
}

export function estimateTokenBudget(text: string): {
  tokens: number;
  characters: number;
  lines: number;
} {
  return {
    tokens: countTokens(text),
    characters: text.length,
    lines: text.split('\n').length,
  };
}
