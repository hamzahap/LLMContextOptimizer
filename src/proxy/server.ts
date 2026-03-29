import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { MessageOptimizer, type ChatMessage, type MessageOptimizerConfig } from './message-optimizer.js';
import { countTokens } from '../token-counter.js';

export interface ProxyConfig {
  port: number;
  target: 'openai' | 'anthropic' | 'auto';
  apiKey?: string;
  optimizer: Partial<MessageOptimizerConfig>;
  verbose: boolean;
}

const TARGET_URLS: Record<string, string> = {
  openai: 'https://api.openai.com',
  anthropic: 'https://api.anthropic.com',
};

// Minimum token count before we bother optimizing.
// Below this, the proxy is pure passthrough with zero modification.
const MIN_TOKENS_TO_OPTIMIZE = 50000;

// Minimum message count before optimizing.
const MIN_MESSAGES_TO_OPTIMIZE = 20;

type EndpointKind = 'openai-chat' | 'openai-responses' | 'anthropic-messages' | 'other';

interface ExtractedPayload {
  messages: ChatMessage[];
  inject: (body: Record<string, unknown>, messages: ChatMessage[]) => void;
}

export function startProxy(config: ProxyConfig): Server {
  const optimizer = new MessageOptimizer(config.optimizer);

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', optimizer: 'active' }));
      return;
    }

    try {
      const body = await readBody(req);
      const path = req.url ?? '';

      const target = detectTarget(path, config.target);
      const endpoint = detectEndpoint(path, target);
      const targetUrl = TARGET_URLS[target];

      if (!targetUrl) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `Unknown target: ${target}` }));
        return;
      }

      const headers = buildForwardHeaders(req, target, config.apiKey);

      // Non-optimizable paths or empty payloads are forwarded exactly as received.
      if (!body || !body.trim() || endpoint === 'other') {
        if (config.verbose) {
          console.log(`[proxy] ${req.method} ${path} -> ${target} (passthrough)`);
        }
        await forwardAndStream(targetUrl, path, req.method ?? 'POST', headers, body, res, config.verbose);
        return;
      }

      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(body) as Record<string, unknown>;
      } catch {
        // Invalid JSON: let upstream API produce the canonical error.
        await forwardAndStream(targetUrl, path, req.method ?? 'POST', headers, body, res, config.verbose);
        return;
      }

      const extracted = extractOptimizablePayload(parsed, endpoint);
      const messageCount = extracted?.messages.length ?? 0;
      const tokenEstimate = countTokens(body);
      const shouldOptimize = messageCount >= MIN_MESSAGES_TO_OPTIMIZE || tokenEstimate >= MIN_TOKENS_TO_OPTIMIZE;

      if (!shouldOptimize) {
        if (config.verbose) {
          console.log(`[proxy] ${req.method} ${path} -> ${target} (passthrough: ${messageCount} msgs, ~${tokenEstimate} tokens)`);
        }
        await forwardAndStream(targetUrl, path, req.method ?? 'POST', headers, body, res, config.verbose);
        return;
      }

      if (!extracted || extracted.messages.length === 0) {
        if (config.verbose) {
          console.log(`[proxy] ${req.method} ${path} -> ${target} (no recognized message shape, passthrough)`);
        }
        await forwardAndStream(targetUrl, path, req.method ?? 'POST', headers, body, res, config.verbose);
        return;
      }

      const configuredBudget = config.optimizer.tokenBudget;
      const modelBudget = getModelBudget(parsed.model as string | undefined);
      const requestBudget = configuredBudget && configuredBudget > 0 ? configuredBudget : modelBudget;

      const result = optimizer.optimize(extracted.messages, requestBudget);

      if (config.verbose) {
        logOptimization(result.stats);
      }

      const bodyToForward = result.stats.saved > 0
        ? (() => {
            extracted.inject(parsed, result.messages);
            return JSON.stringify(parsed);
          })()
        : body;

      await forwardAndStream(targetUrl, path, req.method ?? 'POST', headers, bodyToForward, res, config.verbose);
    } catch (error) {
      if (config.verbose) {
        console.error('[proxy] Error:', error);
      }
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
      }
      res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Internal proxy error' }));
    }
  });

  server.listen(config.port, () => {
    console.log(`LLM Context Optimizer Proxy running on http://localhost:${config.port}`);
    console.log(`Target: ${config.target === 'auto' ? 'auto-detect' : config.target}`);
    console.log('');
    console.log('Configure your tool to use this as the API base URL:');
    console.log(`  OpenAI:    http://localhost:${config.port}/v1`);
    console.log(`  Anthropic: http://localhost:${config.port}`);
    console.log('');
    console.log(`Optimization kicks in at ${MIN_MESSAGES_TO_OPTIMIZE}+ messages or ${MIN_TOKENS_TO_OPTIMIZE}+ tokens.`);
    console.log('Below that threshold, requests pass through unmodified.');
    if (config.verbose) {
      console.log('Verbose mode: logging all requests.');
    }
    console.log('');
  });

  return server;
}

function buildForwardHeaders(req: IncomingMessage, target: string, configApiKey?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (target === 'openai') {
    const apiKey = configApiKey ?? req.headers['authorization']?.replace('Bearer ', '') ?? '';
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
    } else if (req.headers.authorization) {
      headers.Authorization = req.headers.authorization as string;
    }
  } else if (target === 'anthropic') {
    const apiKey = configApiKey ?? (req.headers['x-api-key'] as string) ?? '';
    if (apiKey) {
      headers['x-api-key'] = apiKey;
    }
    headers['anthropic-version'] = (req.headers['anthropic-version'] as string) ?? '2023-06-01';

    for (const [key, value] of Object.entries(req.headers)) {
      if (key.startsWith('anthropic-') && key !== 'anthropic-version' && value) {
        headers[key] = Array.isArray(value) ? value.join(', ') : value;
      }
    }
  }

  return headers;
}

async function forwardAndStream(
  targetUrl: string,
  path: string,
  method: string,
  headers: Record<string, string>,
  body: string,
  res: ServerResponse,
  verbose: boolean,
): Promise<void> {
  const url = `${targetUrl}${path}`;
  const fetchOptions: RequestInit = { method, headers };
  if (body && method !== 'GET') {
    fetchOptions.body = body;
  }

  const proxyResponse = await fetch(url, fetchOptions);

  if (proxyResponse.status >= 400 && verbose) {
    const errBody = await proxyResponse.clone().text();
    console.log(`[proxy] API ${proxyResponse.status}: ${errBody.slice(0, 200)}`);
  }

  const responseHeaders: Record<string, string> = {};
  const contentType = proxyResponse.headers.get('content-type');
  if (contentType) {
    responseHeaders['Content-Type'] = contentType;
  }

  for (const header of ['x-request-id', 'retry-after', 'anthropic-ratelimit-tokens-remaining']) {
    const val = proxyResponse.headers.get(header);
    if (val) {
      responseHeaders[header] = val;
    }
  }

  res.writeHead(proxyResponse.status, responseHeaders);

  if (proxyResponse.body) {
    const reader = proxyResponse.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        res.write(value);
      }
    } finally {
      res.end();
    }
  } else {
    const text = await proxyResponse.text();
    res.end(text);
  }
}

function detectEndpoint(path: string, target: string): EndpointKind {
  if (target === 'openai') {
    if (/\/v1\/chat\/completions(?:\?|$)/.test(path)) {
      return 'openai-chat';
    }
    if (/\/v1\/responses(?:\?|$)/.test(path)) {
      return 'openai-responses';
    }
  }

  if (target === 'anthropic' && /\/v1\/messages(?:\?|$)/.test(path)) {
    return 'anthropic-messages';
  }

  return 'other';
}

function detectTarget(path: string, configured: string): string {
  if (configured !== 'auto') {
    return configured;
  }

  if (path.includes('/v1/chat/completions') || path.includes('/v1/responses')) {
    return 'openai';
  }
  if (path.includes('/v1/messages')) {
    return 'anthropic';
  }
  return 'openai';
}

function extractOptimizablePayload(body: Record<string, unknown>, endpoint: EndpointKind): ExtractedPayload | null {
  if ((endpoint === 'openai-chat' || endpoint === 'anthropic-messages') && Array.isArray(body.messages)) {
    const messages = body.messages.filter(isChatMessage) as ChatMessage[];
    if (messages.length !== body.messages.length) {
      return null;
    }
    return {
      messages,
      inject: (targetBody, nextMessages) => {
        targetBody.messages = nextMessages;
      },
    };
  }

  if (endpoint === 'openai-responses' && Array.isArray(body.input)) {
    const inputMessages = body.input.filter(isChatMessage) as ChatMessage[];
    if (inputMessages.length !== body.input.length) {
      return null;
    }

    return {
      messages: inputMessages,
      inject: (targetBody, nextMessages) => {
        targetBody.input = nextMessages;
      },
    };
  }

  return null;
}

function isChatMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const maybeMessage = value as Record<string, unknown>;
  if (typeof maybeMessage.role !== 'string') {
    return false;
  }

  if (typeof maybeMessage.content === 'string') {
    return true;
  }

  if (Array.isArray(maybeMessage.content)) {
    return maybeMessage.content.every(isContentBlock);
  }

  return false;
}

function isContentBlock(value: unknown): boolean {
  return !!value && typeof value === 'object' && typeof (value as Record<string, unknown>).type === 'string';
}

function getModelBudget(model?: string): number {
  if (!model) {
    return 0;
  }

  const modelTokenLimits: Record<string, number> = {
    'gpt-4o': 128000,
    'gpt-4o-mini': 128000,
    'gpt-4-turbo': 128000,
    'gpt-4': 8192,
    'gpt-3.5-turbo': 16385,
    'claude-3-5-sonnet': 200000,
    'claude-sonnet-4': 200000,
    'claude-3-5-haiku': 200000,
    'claude-haiku-4': 200000,
    'claude-3-opus': 200000,
    'claude-opus-4': 200000,
    o1: 200000,
    'o1-mini': 128000,
    'o3-mini': 200000,
  };

  for (const [key, limit] of Object.entries(modelTokenLimits)) {
    if (model === key || model.startsWith(key)) {
      return Math.floor(limit * 0.8);
    }
  }

  return 0;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
    req.on('error', reject);
  });
}

function logOptimization(stats: { originalTokens: number; optimizedTokens: number; saved: number; actions: string[] }): void {
  if (stats.saved <= 0 && stats.actions.length === 0) {
    return;
  }

  console.log(`[optimizer] ${stats.originalTokens} -> ${stats.optimizedTokens} tokens (saved ${stats.saved})`);
  for (const action of stats.actions) {
    console.log(`[optimizer]   ${action}`);
  }
}
