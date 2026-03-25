import { ProtectionLevel, type CompressedContext } from '../types.js';
import type { LosslessRule } from './built-in-rules.js';

const PROTECTION_PRIORITY: Record<ProtectionLevel, number> = {
  [ProtectionLevel.Immutable]: 4,
  [ProtectionLevel.Preferred]: 3,
  [ProtectionLevel.Normal]: 2,
  [ProtectionLevel.Expendable]: 1,
};

export function evaluateRules(
  context: CompressedContext,
  rules: LosslessRule[]
): ProtectionLevel {
  let matchedLevel: ProtectionLevel | null = null;
  let matchedPriority = -1;

  for (const rule of rules) {
    if (rule.match(context)) {
      const priority = PROTECTION_PRIORITY[rule.protection];
      if (priority > matchedPriority) {
        matchedLevel = rule.protection;
        matchedPriority = priority;
      }
    }
  }

  // If any rule matched, use that level; otherwise default to Normal
  return matchedLevel ?? ProtectionLevel.Normal;
}
