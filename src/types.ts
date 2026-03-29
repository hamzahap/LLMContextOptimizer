// === Shared Enums ===

export enum TaskType {
  BugFix = 'bugfix',
  Refactor = 'refactor',
  Feature = 'feature',
  Review = 'review',
  Documentation = 'documentation',
  Test = 'test',
  Debug = 'debug',
  Exploration = 'exploration',
  Unknown = 'unknown',
}

export enum SourceType {
  File = 'file',
  Diff = 'diff',
  Log = 'log',
  Error = 'error',
  Chat = 'chat',
}

export enum ProtectionLevel {
  Immutable = 'immutable',
  Preferred = 'preferred',
  Normal = 'normal',
  Expendable = 'expendable',
}

// === Pipeline Data Objects ===

export interface TaskProfile {
  type: TaskType;
  confidence: number;
  keywords: string[];
  description: string;
  focusAreas: string[];
}

export interface CandidateContext {
  id: string;
  source: SourceType;
  path?: string;
  content: string;
  metadata: Record<string, unknown>;
  tokenCount: number;
  timestamp?: Date;
}

export interface ScoredContext extends CandidateContext {
  relevanceScore: number;
  scoreBreakdown: Record<string, number>;
}

export interface CompressedContext extends ScoredContext {
  originalTokenCount: number;
  compressedContent: string;
  compressionRatio: number;
  techniquesApplied: string[];
  protectionLevel: ProtectionLevel;
}

export interface ContextBundle {
  sections: ContextSection[];
  totalTokens: number;
  budgetUsed: number;
  metadata: BundleMetadata;
}

export interface ContextSection {
  role: 'system' | 'context' | 'task' | 'reference';
  label: string;
  content: string;
  tokenCount: number;
  sources: string[];
}

export interface BundleMetadata {
  taskProfile: TaskProfile;
  tokenBudget: number;
  totalCandidates: number;
  includedCount: number;
  excludedCount: number;
  compressionSavings: number;
}

// === Audit ===

export interface AuditEntry {
  contextId: string;
  decision: 'included' | 'excluded' | 'compressed';
  reason: string;
  relevanceScore?: number;
  tokensBefore?: number;
  tokensAfter?: number;
}

export interface AuditLog {
  timestamp: Date;
  taskProfile: TaskProfile;
  entries: AuditEntry[];
  summary: AuditSummary;
}

export interface AuditSummary {
  totalCandidates: number;
  included: number;
  excluded: number;
  compressed: number;
  tokenBudget: number;
  tokensUsed: number;
  tokensSaved: number;
}

// === Module Interfaces ===

export interface ITaskClassifier {
  classify(input: string, hints?: Record<string, unknown>): TaskProfile;
}

export interface IContextCollector {
  collect(options: CollectorOptions): Promise<CandidateContext[]>;
}

export interface IRelevanceRanker {
  rank(candidates: CandidateContext[], task: TaskProfile): ScoredContext[];
}

export interface ICompressionEngine {
  compress(contexts: ScoredContext[], task: TaskProfile): CompressedContext[];
}

export interface ILosslessRulesEngine {
  evaluate(context: CompressedContext): ProtectionLevel;
  protect(contexts: CompressedContext[]): CompressedContext[];
}

export interface IContextPacker {
  pack(contexts: CompressedContext[], budget: number, task: TaskProfile): ContextBundle;
}

export interface IAuditLayer {
  record(entry: AuditEntry): void;
  finalize(task: TaskProfile, budget: number): AuditLog;
  getLog(): AuditLog | null;
  reset(): void;
}

// === Config ===

export interface CollectorOptions {
  files?: string[];
  globs?: string[];
  diffs?: string[];
  logs?: string[];
  errors?: string[];
  chatHistory?: string;
  cwd?: string;
}

export interface OptimizerConfig {
  tokenBudget: number;
  model?: string;
  strategyWeights?: Record<string, number>;
  losslessPatterns?: string[];
  compressionLevel?: 'light' | 'moderate' | 'aggressive';
  outputFormat?: 'json' | 'markdown' | 'text';
  auditLog?: boolean;
  auditPath?: string;
}
