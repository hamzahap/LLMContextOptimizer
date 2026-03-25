export function stripComments(content: string, filePath?: string): { result: string; applied: boolean } {
  const lang = detectLanguage(filePath);
  let result: string;

  switch (lang) {
    case 'js':
    case 'ts':
    case 'java':
    case 'c':
    case 'go':
    case 'rust':
      result = stripCStyleComments(content);
      break;
    case 'python':
    case 'ruby':
    case 'shell':
      result = stripHashComments(content);
      break;
    default:
      return { result: content, applied: false };
  }

  const applied = result.length < content.length;
  return { result, applied };
}

function stripCStyleComments(content: string): string {
  // Remove single-line comments (but not URLs with //)
  let result = content.replace(/(?<!:)\/\/(?!\/)[^\n]*/g, '');
  // Remove multi-line comments
  result = result.replace(/\/\*[\s\S]*?\*\//g, '');
  // Clean up empty lines left behind
  result = result.replace(/\n{3,}/g, '\n\n');
  return result;
}

function stripHashComments(content: string): string {
  // Remove hash comments (but preserve shebangs on first line)
  const lines = content.split('\n');
  const result = lines.map((line, i) => {
    // Preserve shebangs
    if (i === 0 && line.startsWith('#!')) return line;
    // Remove hash comments
    return line.replace(/#[^\n]*/, '');
  }).join('\n');
  // Clean up empty lines left behind
  return result.replace(/\n{3,}/g, '\n\n');
}

function detectLanguage(filePath?: string): string {
  if (!filePath) return 'unknown';
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    ts: 'ts', tsx: 'ts', js: 'js', jsx: 'js',
    java: 'java', c: 'c', cpp: 'c', h: 'c', hpp: 'c',
    go: 'go', rs: 'rust', cs: 'c',
    py: 'python', rb: 'ruby', sh: 'shell', bash: 'shell', zsh: 'shell',
  };
  return map[ext] ?? 'unknown';
}
