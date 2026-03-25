import type { ContextBundle } from '../types.js';
import type { Provider, SendOptions } from './types.js';
import { bundleToMessages } from './types.js';

export class OpenAIProvider implements Provider {
  name = 'openai';

  buildMessages(bundle: ContextBundle) {
    return bundleToMessages(bundle);
  }

  async send(bundle: ContextBundle, options: SendOptions): Promise<string> {
    const messages = this.buildMessages(bundle);
    const response = await callOpenAI(messages, options, false);
    return response;
  }

  async *stream(bundle: ContextBundle, options: SendOptions): AsyncIterable<string> {
    const messages = this.buildMessages(bundle);
    const body = JSON.stringify({
      model: options.model,
      messages,
      max_tokens: options.maxTokens ?? 4096,
      temperature: options.temperature ?? 0,
      stream: true,
    });

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${options.apiKey}`,
      },
      body,
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`OpenAI API error (${response.status}): ${err}`);
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
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);
        if (data === '[DONE]') return;

        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) yield content;
        } catch {
          // Skip unparseable chunks
        }
      }
    }
  }
}

async function callOpenAI(
  messages: { role: string; content: string }[],
  options: SendOptions,
  _stream: boolean
): Promise<string> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${options.apiKey}`,
    },
    body: JSON.stringify({
      model: options.model,
      messages,
      max_tokens: options.maxTokens ?? 4096,
      temperature: options.temperature ?? 0,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI API error (${response.status}): ${err}`);
  }

  const data = await response.json() as { choices: { message: { content: string } }[] };
  return data.choices[0]?.message?.content ?? '';
}
