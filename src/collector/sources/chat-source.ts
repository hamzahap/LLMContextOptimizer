import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { SourceType, type CandidateContext, type CollectorOptions } from '../../types.js';
import { countTokens } from '../../token-counter.js';
import type { IContextSource } from '../source-registry.js';

export interface ChatMessage {
  role: string;
  content: string;
  timestamp?: string;
}

export class ChatSource implements IContextSource {
  type = SourceType.Chat;

  async collect(options: CollectorOptions): Promise<CandidateContext[]> {
    if (!options.chatHistory) return [];

    const cwd = options.cwd ?? process.cwd();
    let messages: ChatMessage[];

    try {
      // Try to read as a file path first
      const absPath = resolve(cwd, options.chatHistory);
      const raw = await readFile(absPath, 'utf-8');
      messages = JSON.parse(raw) as ChatMessage[];
    } catch {
      // Try to parse as inline JSON
      try {
        messages = JSON.parse(options.chatHistory) as ChatMessage[];
      } catch {
        // Treat as plain text conversation
        return [{
          id: 'chat:history',
          source: SourceType.Chat,
          content: options.chatHistory,
          metadata: { format: 'plain' },
          tokenCount: countTokens(options.chatHistory),
        }];
      }
    }

    if (!Array.isArray(messages)) return [];

    return messages.map((msg, i) => ({
      id: `chat:${i}-${msg.role}`,
      source: SourceType.Chat,
      content: msg.content,
      metadata: {
        role: msg.role,
        index: i,
        timestamp: msg.timestamp,
      },
      tokenCount: countTokens(msg.content),
      timestamp: msg.timestamp ? new Date(msg.timestamp) : undefined,
    }));
  }
}
