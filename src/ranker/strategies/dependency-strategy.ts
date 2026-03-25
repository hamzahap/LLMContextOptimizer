import type { CandidateContext, TaskProfile } from '../../types.js';

const IMPORT_PATTERNS = [
  /import\s+.*?from\s+['"]([^'"]+)['"]/g,
  /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /from\s+(\S+)\s+import/g, // Python
];

export function scoreByDependency(
  candidate: CandidateContext,
  task: TaskProfile,
  allCandidates: CandidateContext[]
): number {
  // Only relevant for file sources
  if (!candidate.path) return 0.5;

  const focusPaths = task.focusAreas.filter(a => a.includes('.') || a.includes('/'));
  if (focusPaths.length === 0) return 0.5;

  // Check if candidate imports any focus files
  const imports = extractImports(candidate.content);
  let importScore = 0;
  for (const imp of imports) {
    for (const focus of focusPaths) {
      if (imp.includes(stripExtension(focus)) || focus.includes(stripExtension(imp))) {
        importScore += 0.3;
      }
    }
  }

  // Check if any focus file imports this candidate
  let importedByScore = 0;
  for (const other of allCandidates) {
    if (other.id === candidate.id || !other.path) continue;
    const isFocus = focusPaths.some(f => other.path!.includes(f) || f.includes(other.path!));
    if (!isFocus) continue;

    const otherImports = extractImports(other.content);
    for (const imp of otherImports) {
      if (candidate.path && (imp.includes(stripExtension(candidate.path)) ||
          stripExtension(candidate.path).includes(imp))) {
        importedByScore += 0.3;
      }
    }
  }

  return Math.min(importScore + importedByScore, 1.0);
}

function extractImports(content: string): string[] {
  const imports: string[] = [];
  for (const pattern of IMPORT_PATTERNS) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match;
    while ((match = regex.exec(content)) !== null) {
      imports.push(match[1]);
    }
  }
  return imports;
}

function stripExtension(path: string): string {
  return path.replace(/\.\w+$/, '');
}
