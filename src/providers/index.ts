import type { Provider } from './types.js';
import { OpenAIProvider } from './openai.js';
import { AnthropicProvider } from './anthropic.js';

const PROVIDERS: Record<string, () => Provider> = {
  openai: () => new OpenAIProvider(),
  anthropic: () => new AnthropicProvider(),
};

export function getProvider(name: string): Provider {
  const factory = PROVIDERS[name];
  if (!factory) {
    const available = Object.keys(PROVIDERS).join(', ');
    throw new Error(`Unknown provider "${name}". Available: ${available}`);
  }
  return factory();
}

export function listProviders(): string[] {
  return Object.keys(PROVIDERS);
}

export { OpenAIProvider } from './openai.js';
export { AnthropicProvider } from './anthropic.js';
export type { Provider, SendOptions, Message } from './types.js';
export { bundleToMessages } from './types.js';
