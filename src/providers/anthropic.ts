import type { ContextBundle } from '../types.js';
import type { Provider, SendOptions } from './types.js';
import { bundleToMessages } from './types.js';

export class AnthropicProvider implements Provider {
  name = 'anthropic';

  buildMessages(bundle: ContextBundle) {
    return bundleToMessages(bundle);
  }

  async send(bundle: ContextBundle, options: SendOptions): Promise<string> {
    const messages = this.buildMessages(bundle);
    const { system, userMessages } = splitSystemMessage(messages);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': options.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: options.model,
        max_tokens: options.maxTokens ?? 4096,
        system: system || undefined,
        messages: userMessages,
        temperature: options.temperature ?? 0,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Anthropic API error (${response.status}): ${err}`);
    }

    const data = await response.json() as { content: { type: string; text: string }[] };
    return data.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('');
  }

  async *stream(bundle: ContextBundle, options: SendOptions): AsyncIterable<string> {
    const messages = this.buildMessages(bundle);
    const { system, userMessages } = splitSystemMessage(messages);

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': options.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: options.model,
        max_tokens: options.maxTokens ?? 4096,
        system: system || undefined,
        messages: userMessages,
        temperature: options.temperature ?? 0,
        stream: true,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Anthropic API error (${response.status}): ${err}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);

        try {
          const parsed = JSON.parse(data);
          if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
            yield parsed.delta.text;
          }
        } catch {
          // Skip unparseable chunks
        }
      }
    }
  }
}

function splitSystemMessage(messages: { role: string; content: string }[]) {
  let system = '';
  const userMessages: { role: string; content: string }[] = [];

  for (const msg of messages) {
    if (msg.role === 'system') {
      system += (system ? '\n\n' : '') + msg.content;
    } else {
      userMessages.push(msg);
    }
  }

  return { system, userMessages };
}
