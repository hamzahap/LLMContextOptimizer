import { SourceType, ProtectionLevel, type CompressedContext } from '../types.js';

export interface LosslessRule {
  name: string;
  description: string;
  match: (context: CompressedContext) => boolean;
  protection: ProtectionLevel;
}

export const BUILT_IN_RULES: LosslessRule[] = [
  {
    name: 'user-request',
    description: 'The original user request must never be altered',
    match: (ctx) => ctx.metadata['isUserRequest'] === true,
    protection: ProtectionLevel.Immutable,
  },
  {
    name: 'stack-trace',
    description: 'Stack traces must remain exact',
    match: (ctx) =>
      ctx.source === SourceType.Error ||
      (ctx.metadata['hasStackTrace'] === true),
    protection: ProtectionLevel.Immutable,
  },
  {
    name: 'test-failure',
    description: 'Test failure output must remain exact',
    match: (ctx) =>
      ctx.source === SourceType.Error &&
      /(?:FAIL|AssertionError|expect\()/i.test(ctx.content),
    protection: ProtectionLevel.Immutable,
  },
  {
    name: 'error-output',
    description: 'Error messages and logs with errors are preserved',
    match: (ctx) =>
      ctx.source === SourceType.Log &&
      ctx.metadata['hasErrors'] === true,
    protection: ProtectionLevel.Preferred,
  },
  {
    name: 'recent-diff',
    description: 'Recent diffs are important for review tasks',
    match: (ctx) => ctx.source === SourceType.Diff,
    protection: ProtectionLevel.Preferred,
  },
  {
    name: 'schema-contract',
    description: 'Schemas, interfaces, and API contracts should be preserved',
    match: (ctx) =>
      ctx.source === SourceType.File && (
        /interface\s+\w+/i.test(ctx.content) ||
        /type\s+\w+\s*=/i.test(ctx.content) ||
        /schema/i.test(ctx.path ?? '') ||
        /\.schema\./i.test(ctx.path ?? '') ||
        /swagger|openapi/i.test(ctx.path ?? '')
      ),
    protection: ProtectionLevel.Preferred,
  },
  {
    name: 'old-chat',
    description: 'Old conversation history can be compressed aggressively',
    match: (ctx) => ctx.source === SourceType.Chat && (ctx.metadata['index'] as number) < 3,
    protection: ProtectionLevel.Expendable,
  },
  {
    name: 'boilerplate-log',
    description: 'Logs without errors are low priority',
    match: (ctx) =>
      ctx.source === SourceType.Log &&
      ctx.metadata['hasErrors'] !== true,
    protection: ProtectionLevel.Expendable,
  },
];
