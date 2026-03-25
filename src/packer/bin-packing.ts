import { ProtectionLevel, type CompressedContext } from '../types.js';

const PROTECTION_PRIORITY: Record<ProtectionLevel, number> = {
  [ProtectionLevel.Immutable]: 4,
  [ProtectionLevel.Preferred]: 3,
  [ProtectionLevel.Normal]: 2,
  [ProtectionLevel.Expendable]: 1,
};

export interface PackResult {
  included: CompressedContext[];
  excluded: CompressedContext[];
}

export function packItems(items: CompressedContext[], budget: number): PackResult {
  // Sort by: protection level (desc), then value density (relevance / tokens)
  const sorted = [...items].sort((a, b) => {
    const protDiff = PROTECTION_PRIORITY[b.protectionLevel] - PROTECTION_PRIORITY[a.protectionLevel];
    if (protDiff !== 0) return protDiff;

    const densityA = a.tokenCount > 0 ? a.relevanceScore / a.tokenCount : 0;
    const densityB = b.tokenCount > 0 ? b.relevanceScore / b.tokenCount : 0;
    return densityB - densityA;
  });

  const included: CompressedContext[] = [];
  const excluded: CompressedContext[] = [];
  let remaining = budget;

  for (const item of sorted) {
    const tokens = item.tokenCount;

    // Immutable items are always included
    if (item.protectionLevel === ProtectionLevel.Immutable) {
      included.push(item);
      remaining -= tokens;
      continue;
    }

    // Skip if no budget left
    if (tokens > remaining) {
      excluded.push(item);
      continue;
    }

    included.push(item);
    remaining -= tokens;
  }

  return { included, excluded };
}
