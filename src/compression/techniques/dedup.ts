export function deduplicateLines(content: string): { result: string; applied: boolean } {
  const lines = content.split('\n');
  if (lines.length < 3) return { result: content, applied: false };

  const output: string[] = [];
  let repeatCount = 0;
  let lastLine = '';

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === lastLine.trim() && trimmed.length > 0) {
      repeatCount++;
    } else {
      if (repeatCount > 0) {
        output.push(`  [...repeated ${repeatCount} more time${repeatCount > 1 ? 's' : ''}]`);
        repeatCount = 0;
      }
      output.push(line);
      lastLine = line;
    }
  }

  if (repeatCount > 0) {
    output.push(`  [...repeated ${repeatCount} more time${repeatCount > 1 ? 's' : ''}]`);
  }

  const result = output.join('\n');
  const applied = output.length < lines.length;
  return { result, applied };
}
