import { countTokens } from '../token-counter.js';
import { deduplicateLines } from '../compression/techniques/dedup.js';
import { summarizeBlock } from '../compression/techniques/summarizer.js';
import { truncateContent } from '../compression/techniques/truncator.js';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
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
  tokenBudget: 0, // 0 = auto (use model's limit)
  preserveSystemMessages: true,
  preserveLastNTurns: 6,   // Always keep the last 6 messages (3 back-and-forth)
  preserveFirstNTurns: 2,  // Keep the first system + user message
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

    // 1. Remove empty messages
    if (this.config.removeEmptyMessages) {
      const before = result.length;
      result = result.filter(m => getTextContent(m.content).trim().length > 0);
      if (result.length < before) {
        actions.push(`removed ${before - result.length} empty messages`);
      }
    }

    // 2. Deduplicate repeated content across messages
    if (this.config.deduplicateContent) {
      const deduped = this.deduplicateMessages(result);
      if (deduped.changed) {
        result = deduped.messages;
        actions.push(`deduplicated ${deduped.count} repeated blocks`);
      }
    }

    // 3. Deduplicate lines within individual messages (logs, repeated output)
    result = result.map(msg => {
      const text = getTextContent(msg.content);
      const { result: deduped, applied } = deduplicateLines(text);
      if (applied) {
        actions.push(`deduplicated lines in ${msg.role} message`);
        return { ...msg, content: setTextContent(msg.content, deduped) };
      }
      return msg;
    });

    // 4. Compress old conversation turns (keep first N and last N)
    if (this.config.compressOldTurns && result.length > this.config.preserveFirstNTurns + this.config.preserveLastNTurns) {
      result = this.compressMiddleTurns(result, actions);
    }

    // 5. If still over budget, progressively truncate oldest non-protected messages
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
    const seen = new Map<string, number>();
    const result: ChatMessage[] = [];
    let dedupCount = 0;

    for (const msg of messages) {
      const text = getTextContent(msg.content);
      // Hash by first 200 chars + role to detect duplicates
      const key = `${msg.role}:${text.slice(0, 200)}`;
      const prevIndex = seen.get(key);

      if (prevIndex !== undefined && text.length > 50) {
        // Skip duplicate, but keep a marker
        dedupCount++;
        continue;
      }

      seen.set(key, result.length);
      result.push(msg);
    }

    return { messages: result, changed: dedupCount > 0, count: dedupCount };
  }

  private compressMiddleTurns(messages: ChatMessage[], actions: string[]): ChatMessage[] {
    // Separate system messages
    const systemMsgs = this.config.preserveSystemMessages
      ? messages.filter(m => m.role === 'system')
      : [];
    const nonSystem = messages.filter(m => m.role !== 'system');

    const keepFirst = Math.min(this.config.preserveFirstNTurns, nonSystem.length);
    const keepLast = Math.min(this.config.preserveLastNTurns, nonSystem.length);

    if (keepFirst + keepLast >= nonSystem.length) {
      return messages; // Nothing to compress
    }

    const first = nonSystem.slice(0, keepFirst);
    const middle = nonSystem.slice(keepFirst, -keepLast);
    const last = nonSystem.slice(-keepLast);

    // Summarize middle turns
    const middleSummary = this.summarizeMiddle(middle);
    actions.push(`compressed ${middle.length} middle turns into summary`);

    const summaryMessage: ChatMessage = {
      role: 'user',
      content: `[Previous conversation summary (${middle.length} messages compressed)]\n${middleSummary}`,
    };

    return [...systemMsgs, ...first, summaryMessage, ...last];
  }

  private summarizeMiddle(messages: ChatMessage[]): string {
    const lines: string[] = [];

    for (const msg of messages) {
      const text = getTextContent(msg.content);
      // Take first 2 lines or 150 chars as summary of each message
      const preview = text.split('\n').slice(0, 2).join(' ').slice(0, 150);
      if (preview.trim()) {
        lines.push(`- [${msg.role}]: ${preview}${text.length > 150 ? '...' : ''}`);
      }
    }

    return lines.join('\n');
  }

  private fitToBudget(messages: ChatMessage[], budget: number, actions: string[]): ChatMessage[] {
    let total = this.countAllTokens(messages);
    if (total <= budget) return messages;

    const result = [...messages];

    // Find compressible messages (not system, not in last N)
    const protectedEnd = Math.min(this.config.preserveLastNTurns, result.length);

    // Work backwards from oldest non-protected messages
    for (let i = 0; i < result.length - protectedEnd && total > budget; i++) {
      const msg = result[i];
      if (msg.role === 'system' && this.config.preserveSystemMessages) continue;

      const text = getTextContent(msg.content);
      const tokensBefore = countTokens(text);

      // Try summarizing first
      const { result: summarized, applied: wasSummarized } = summarizeBlock(text, {
        maxLines: 20, keepFirst: 8, keepLast: 5,
      });
      if (wasSummarized) {
        result[i] = { ...msg, content: setTextContent(msg.content, summarized) };
        total -= tokensBefore - countTokens(summarized);
        actions.push(`summarized old ${msg.role} message`);
        continue;
      }

      // If still over, truncate
      if (total > budget) {
        const maxTokens = Math.max(100, Math.floor(tokensBefore * 0.3));
        const { result: truncated, applied: wasTruncated } = truncateContent(text, { maxTokens });
        if (wasTruncated) {
          result[i] = { ...msg, content: setTextContent(msg.content, truncated) };
          total -= tokensBefore - countTokens(truncated);
          actions.push(`truncated old ${msg.role} message`);
        }
      }
    }

    // Last resort: drop oldest non-protected messages entirely
    if (total > budget) {
      const dropped: number[] = [];
      for (let i = 0; i < result.length - protectedEnd && total > budget; i++) {
        if (result[i].role === 'system' && this.config.preserveSystemMessages) continue;
        total -= countTokens(getTextContent(result[i].content));
        dropped.push(i);
      }
      if (dropped.length > 0) {
        actions.push(`dropped ${dropped.length} oldest messages to fit budget`);
        return result.filter((_, i) => !dropped.includes(i));
      }
    }

    return result;
  }

  private countAllTokens(messages: ChatMessage[]): number {
    return messages.reduce((sum, m) => sum + countTokens(getTextContent(m.content)), 0);
  }
}

function getTextContent(content: string | ContentBlock[]): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter(b => b.type === 'text' && b.text)
      .map(b => b.text!)
      .join('\n');
  }
  return String(content);
}

function setTextContent(original: string | ContentBlock[], newText: string): string | ContentBlock[] {
  if (typeof original === 'string') return newText;
  if (Array.isArray(original)) {
    // Replace text blocks, keep non-text blocks (images, etc.)
    let textIndex = 0;
    const textParts = newText.split('\n---BLOCK_SPLIT---\n');
    return original.map(block => {
      if (block.type === 'text') {
        return { ...block, text: textParts[textIndex++] ?? newText };
      }
      return block;
    });
  }
  return newText;
}
