import { countTokens } from '../token-counter.js';
import { deduplicateLines } from '../compression/techniques/dedup.js';
import { summarizeBlock } from '../compression/techniques/summarizer.js';
import { truncateContent } from '../compression/techniques/truncator.js';

export interface ChatMessage {
  role: string;
  content: string | ContentBlock[];
}

export interface ContentBlock {
  type: string;
  text?: string;
  [key: string]: unknown;
}

export interface OptimizeResult {
  messages: ChatMessage[];
  stats: {
    originalTokens: number;
    optimizedTokens: number;
    saved: number;
    messagesOriginal: number;
    messagesOptimized: number;
    actions: string[];
  };
}

export interface MessageOptimizerConfig {
  tokenBudget: number;
  preserveSystemMessages: boolean;
  preserveLastNTurns: number;
  preserveFirstNTurns: number;
  deduplicateContent: boolean;
  compressOldTurns: boolean;
  removeEmptyMessages: boolean;
}

const DEFAULT_CONFIG: MessageOptimizerConfig = {
  tokenBudget: 0,
  preserveSystemMessages: true,
  preserveLastNTurns: 6,
  preserveFirstNTurns: 2,
  deduplicateContent: true,
  compressOldTurns: true,
  removeEmptyMessages: true,
};

export class MessageOptimizer {
  private config: MessageOptimizerConfig;

  constructor(config: Partial<MessageOptimizerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  optimize(messages: ChatMessage[], tokenBudget?: number): OptimizeResult {
    const budget = tokenBudget ?? this.config.tokenBudget;
    const actions: string[] = [];
    let result = [...messages];
    const originalTokens = this.countAllTokens(result);
    const originalCount = result.length;

    if (this.config.removeEmptyMessages) {
      const before = result.length;
      result = result.filter((m) => !isMessageEmpty(m));
      if (result.length < before) {
        actions.push(`removed ${before - result.length} empty messages`);
      }
    }

    if (this.config.deduplicateContent) {
      const deduped = this.deduplicateMessages(result);
      if (deduped.changed) {
        result = deduped.messages;
        actions.push(`deduplicated ${deduped.count} repeated blocks`);
      }
    }

    result = result.map((msg) => {
      const transformed = transformTextContent(msg.content, deduplicateLines);
      if (transformed.changed) {
        actions.push(`deduplicated lines in ${msg.role} message`);
        return { ...msg, content: transformed.content };
      }
      return msg;
    });

    if (this.config.compressOldTurns && result.length > this.config.preserveFirstNTurns + this.config.preserveLastNTurns) {
      result = this.compressMiddleTurns(result, actions);
    }

    if (budget > 0) {
      result = this.fitToBudget(result, budget, actions);
    }

    const optimizedTokens = this.countAllTokens(result);

    return {
      messages: result,
      stats: {
        originalTokens,
        optimizedTokens,
        saved: originalTokens - optimizedTokens,
        messagesOriginal: originalCount,
        messagesOptimized: result.length,
        actions,
      },
    };
  }

  private deduplicateMessages(messages: ChatMessage[]): { messages: ChatMessage[]; changed: boolean; count: number } {
    const seen = new Set<string>();
    const result: ChatMessage[] = [];
    let dedupCount = 0;

    for (const msg of messages) {
      const text = getTextContent(msg.content);
      const key = `${msg.role}:${text.slice(0, 200)}`;

      if (seen.has(key) && text.length > 50) {
        dedupCount++;
        continue;
      }

      seen.add(key);
      result.push(msg);
    }

    return { messages: result, changed: dedupCount > 0, count: dedupCount };
  }

  private compressMiddleTurns(messages: ChatMessage[], actions: string[]): ChatMessage[] {
    const compressibleIndices: number[] = [];

    for (let i = 0; i < messages.length; i++) {
      if (!this.config.preserveSystemMessages || messages[i].role !== 'system') {
        compressibleIndices.push(i);
      }
    }

    const keepFirst = Math.min(this.config.preserveFirstNTurns, compressibleIndices.length);
    const keepLast = Math.min(this.config.preserveLastNTurns, compressibleIndices.length);

    if (keepFirst + keepLast >= compressibleIndices.length) {
      return messages;
    }

    const middleIndices = compressibleIndices.slice(keepFirst, compressibleIndices.length - keepLast);
    if (middleIndices.length === 0) {
      return messages;
    }

    const middleMessages = middleIndices.map((index) => messages[index]);
    const middleSummary = this.summarizeMiddle(middleMessages);
    actions.push(`compressed ${middleMessages.length} middle turns into summary`);

    const summaryMessage: ChatMessage = {
      role: 'user',
      content: `[Previous conversation summary (${middleMessages.length} messages compressed)]\n${middleSummary}`,
    };

    const middleSet = new Set(middleIndices);
    const firstMiddleIndex = middleIndices[0];
    const next: ChatMessage[] = [];

    for (let i = 0; i < messages.length; i++) {
      if (i === firstMiddleIndex) {
        next.push(summaryMessage);
      }

      if (middleSet.has(i)) {
        continue;
      }

      next.push(messages[i]);
    }

    return next;
  }

  private summarizeMiddle(messages: ChatMessage[]): string {
    const lines: string[] = [];

    for (const msg of messages) {
      const text = getTextContent(msg.content);
      const preview = text.split('\n').slice(0, 2).join(' ').slice(0, 150);
      if (preview.trim()) {
        lines.push(`- [${msg.role}]: ${preview}${text.length > 150 ? '...' : ''}`);
      }
    }

    return lines.join('\n');
  }

  private fitToBudget(messages: ChatMessage[], budget: number, actions: string[]): ChatMessage[] {
    let total = this.countAllTokens(messages);
    if (total <= budget) {
      return messages;
    }

    const result = [...messages];
    const protectedEnd = Math.min(this.config.preserveLastNTurns, result.length);

    for (let i = 0; i < result.length - protectedEnd && total > budget; i++) {
      const msg = result[i];
      if (msg.role === 'system' && this.config.preserveSystemMessages) {
        continue;
      }

      const tokensBefore = countContentTokens(msg.content);
      const summarized = transformTextContent(msg.content, (text) => summarizeBlock(text, {
        maxLines: 20,
        keepFirst: 8,
        keepLast: 5,
      }));

      if (summarized.changed) {
        const tokensAfter = countContentTokens(summarized.content);
        result[i] = { ...msg, content: summarized.content };
        total -= tokensBefore - tokensAfter;
        actions.push(`summarized old ${msg.role} message`);
        continue;
      }

      if (total > budget) {
        const truncated = transformTextContent(msg.content, (text) => {
          const maxTokens = Math.max(100, Math.floor(countTokens(text) * 0.3));
          return truncateContent(text, { maxTokens });
        });

        if (truncated.changed) {
          const tokensAfter = countContentTokens(truncated.content);
          result[i] = { ...msg, content: truncated.content };
          total -= tokensBefore - tokensAfter;
          actions.push(`truncated old ${msg.role} message`);
        }
      }
    }

    if (total > budget) {
      const dropped: number[] = [];
      for (let i = 0; i < result.length - protectedEnd && total > budget; i++) {
        if (result[i].role === 'system' && this.config.preserveSystemMessages) {
          continue;
        }

        total -= countContentTokens(result[i].content);
        dropped.push(i);
      }

      if (dropped.length > 0) {
        actions.push(`dropped ${dropped.length} oldest messages to fit budget`);
        return result.filter((_, index) => !dropped.includes(index));
      }
    }

    return result;
  }

  private countAllTokens(messages: ChatMessage[]): number {
    return messages.reduce((sum, m) => sum + countContentTokens(m.content), 0);
  }
}

function isMessageEmpty(msg: ChatMessage): boolean {
  if (typeof msg.content === 'string') {
    return msg.content.trim().length === 0;
  }

  if (Array.isArray(msg.content)) {
    return msg.content.length === 0;
  }

  return !msg.content;
}

function countContentTokens(content: string | ContentBlock[]): number {
  return countTokens(getTextContent(content));
}

function getTextContent(content: string | ContentBlock[]): string {
  if (typeof content === 'string') {
    return content;
  }

  if (!Array.isArray(content)) {
    return '';
  }

  return content
    .filter((block) => block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text as string)
    .join('\n');
}

function transformTextContent(
  original: string | ContentBlock[],
  transform: (text: string) => { result: string; applied: boolean },
): { content: string | ContentBlock[]; changed: boolean } {
  if (typeof original === 'string') {
    const next = transform(original);
    return { content: next.result, changed: next.applied };
  }

  if (!Array.isArray(original)) {
    return { content: original, changed: false };
  }

  let changed = false;
  const nextBlocks = original.map((block) => {
    if (block.type !== 'text' || typeof block.text !== 'string') {
      return block;
    }

    const next = transform(block.text);
    if (!next.applied) {
      return block;
    }

    changed = true;
    return {
      ...block,
      text: next.result,
    };
  });

  return { content: nextBlocks, changed };
}
