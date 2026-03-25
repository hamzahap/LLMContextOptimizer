import type { ContextBundle } from '../types.js';

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface SendOptions {
  model: string;
  apiKey: string;
  maxTokens?: number;
  temperature?: number;
  stream?: boolean;
}

export interface Provider {
  name: string;
  buildMessages(bundle: ContextBundle): Message[];
  send(bundle: ContextBundle, options: SendOptions): Promise<string>;
  stream(bundle: ContextBundle, options: SendOptions): AsyncIterable<string>;
}

export function bundleToMessages(bundle: ContextBundle): Message[] {
  const messages: Message[] = [];

  // System sections become the system message
  const systemParts: string[] = [];
  const contextParts: string[] = [];
  let taskContent = '';

  for (const section of bundle.sections) {
    switch (section.role) {
      case 'system':
        systemParts.push(section.content);
        break;
      case 'task':
        taskContent = section.content;
        break;
      case 'context':
      case 'reference':
        contextParts.push(`## ${section.label}\n\n${section.content}`);
        break;
    }
  }

  // Build system message with context
  const systemContent = [
    ...systemParts,
    'Below is the relevant context for this task:',
    '',
    ...contextParts,
  ].join('\n\n');

  if (systemContent.trim()) {
    messages.push({ role: 'system', content: systemContent });
  }

  // Task becomes the user message
  if (taskContent) {
    messages.push({ role: 'user', content: taskContent });
  }

  return messages;
}
