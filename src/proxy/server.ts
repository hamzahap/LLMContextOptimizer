import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
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
// Below this, the proxy is pure passthrough — zero modification.
const MIN_TOKENS_TO_OPTIMIZE = 50000;

// Minimum message count before optimizing
const MIN_MESSAGES_TO_OPTIMIZE = 20;

export function startProxy(config: ProxyConfig): void {
  const optimizer = new MessageOptimizer(config.optimizer);

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    // Health check
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', optimizer: 'active' }));
      return;
    }

    try {
      const body = await readBody(req);
      const path = req.url ?? '';

      // Detect target
      const target = detectTarget(path, config.target);
      const targetUrl = TARGET_URLS[target];
      if (!targetUrl) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `Unknown target: ${target}` }));
        return;
      }

      // Build headers for forwarding — do this FIRST, before any body parsing
      const headers = buildForwardHeaders(req, target, config.apiKey);

      // For non-chat endpoints (count_tokens, etc.) or empty bodies: pure passthrough
      const isChatEndpoint = isChatCompletionEndpoint(path, target);

      if (!body || !body.trim() || !isChatEndpoint) {
        // Pure passthrough — forward exactly as received
        if (config.verbose) {
          console.log(`[proxy] ${req.method} ${path} → ${target} (passthrough)`);
        }
        await forwardAndStream(targetUrl, path, req.method ?? 'POST', headers, body, res, config.verbose);
        return;
      }

      // Parse the body
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(body);
      } catch {
        // Invalid JSON — forward as-is, let the API return the error
        await forwardAndStream(targetUrl, path, req.method ?? 'POST', headers, body, res, config.verbose);
        return;
      }

      // Check if this conversation is large enough to benefit from optimization
      const messages = Array.isArray(parsed.messages) ? parsed.messages as ChatMessage[] : [];
      const tokenEstimate = countTokens(body);
      const shouldOptimize = messages.length >= MIN_MESSAGES_TO_OPTIMIZE
        || tokenEstimate >= MIN_TOKENS_TO_OPTIMIZE;

      if (!shouldOptimize) {
        // Small conversation — pure passthrough, don't touch anything
        if (config.verbose) {
          console.log(`[proxy] ${req.method} ${path} → ${target} (passthrough: ${messages.length} msgs, ~${tokenEstimate} tokens)`);
        }
        // Still sanitize unknown fields to prevent API rejections
        const sanitized = sanitizeBody(parsed, target);
        await forwardAndStream(targetUrl, path, req.method ?? 'POST', headers, JSON.stringify(sanitized), res, config.verbose);
        return;
      }

      // Large enough — run the optimizer
      const chatMessages = extractMessages(parsed, target);
      if (chatMessages && chatMessages.length > 0) {
        const modelBudget = getModelBudget(parsed.model as string | undefined);
        const result = optimizer.optimize(chatMessages, modelBudget);

        if (config.verbose) {
          logOptimization(result.stats);
        }

        // Only inject if we actually saved tokens
        if (result.stats.saved > 0) {
          injectMessages(parsed, result.messages, target);
        }
      }

      // Sanitize and forward
      const sanitized = sanitizeBody(parsed, target);

      if (config.verbose) {
        const stripped = Object.keys(parsed).filter(k => !(k in sanitized));
        if (stripped.length > 0) {
          console.log(`[proxy] Stripped fields: ${stripped.join(', ')}`);
        }
      }

      await forwardAndStream(targetUrl, path, req.method ?? 'POST', headers, JSON.stringify(sanitized), res, config.verbose);

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
}

/** Build headers for the target API, forwarding auth and relevant client headers */
function buildForwardHeaders(req: IncomingMessage, target: string, configApiKey?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (target === 'openai') {
    const apiKey = configApiKey
      ?? req.headers['authorization']?.replace('Bearer ', '')
      ?? '';
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
    } else if (req.headers['authorization']) {
      // Forward the raw Authorization header as-is
      headers['Authorization'] = req.headers['authorization'] as string;
    }
  } else if (target === 'anthropic') {
    const apiKey = configApiKey
      ?? req.headers['x-api-key'] as string
      ?? '';
    if (apiKey) {
      headers['x-api-key'] = apiKey;
    }
    headers['anthropic-version'] = (req.headers['anthropic-version'] as string) ?? '2023-06-01';
    // Forward all anthropic-* headers from the client
    for (const [key, value] of Object.entries(req.headers)) {
      if (key.startsWith('anthropic-') && key !== 'anthropic-version' && value) {
        headers[key] = Array.isArray(value) ? value.join(', ') : value;
      }
    }
  }

  return headers;
}

/** Forward a request to the target API and stream the response back */
async function forwardAndStream(
  targetUrl: string, path: string, method: string,
  headers: Record<string, string>, body: string,
  res: ServerResponse, verbose: boolean,
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

  // Build response headers
  const responseHeaders: Record<string, string> = {};
  const contentType = proxyResponse.headers.get('content-type');
  if (contentType) {
    responseHeaders['Content-Type'] = contentType;
  }
  // Forward other useful response headers
  for (const header of ['x-request-id', 'retry-after', 'anthropic-ratelimit-tokens-remaining']) {
    const val = proxyResponse.headers.get(header);
    if (val) responseHeaders[header] = val;
  }

  res.writeHead(proxyResponse.status, responseHeaders);

  if (proxyResponse.body) {
    const reader = proxyResponse.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
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

/** Check if this is a chat completion / messages endpoint (vs count_tokens, models, etc.) */
function isChatCompletionEndpoint(path: string, target: string): boolean {
  if (target === 'openai') {
    return path.includes('/chat/completions') || path.includes('/responses');
  }
  if (target === 'anthropic') {
    // /v1/messages but NOT /v1/messages/count_tokens or /v1/messages/batches
    return /\/v1\/messages(\?|$)/.test(path);
  }
  return false;
}

function detectTarget(path: string, configured: string): string {
  if (configured !== 'auto') return configured;
  if (path.includes('/v1/chat/completions') || path.includes('/v1/responses')) return 'openai';
  if (path.includes('/v1/messages')) return 'anthropic';
  return 'openai';
}

function extractMessages(body: Record<string, unknown>, target: string): ChatMessage[] | null {
  if (target === 'openai' && Array.isArray(body.messages)) {
    return body.messages as ChatMessage[];
  }
  if (target === 'anthropic') {
    // For Anthropic, DON'T touch the system prompt — only optimize conversation messages
    if (Array.isArray(body.messages)) {
      return body.messages as ChatMessage[];
    }
  }
  return null;
}

function injectMessages(body: Record<string, unknown>, messages: ChatMessage[], _target: string): void {
  body.messages = messages;
}

// Allowed fields per API — strip anything else to avoid rejection
const ANTHROPIC_ALLOWED_FIELDS = new Set([
  'model', 'messages', 'system', 'max_tokens', 'temperature', 'top_p', 'top_k',
  'stop_sequences', 'stream', 'metadata', 'tools', 'tool_choice',
  'thinking', 'service_tier',
]);

const OPENAI_ALLOWED_FIELDS = new Set([
  'model', 'messages', 'max_tokens', 'max_completion_tokens', 'temperature', 'top_p',
  'n', 'stream', 'stream_options', 'stop', 'presence_penalty', 'frequency_penalty',
  'logit_bias', 'logprobs', 'top_logprobs', 'user', 'seed', 'tools', 'tool_choice',
  'parallel_tool_calls', 'response_format', 'service_tier', 'store', 'metadata',
  'reasoning_effort',
]);

function sanitizeBody(body: Record<string, unknown>, target: string): Record<string, unknown> {
  const allowed = target === 'anthropic' ? ANTHROPIC_ALLOWED_FIELDS : OPENAI_ALLOWED_FIELDS;
  const sanitized: Record<string, unknown> = {};
  for (const key of Object.keys(body)) {
    if (allowed.has(key)) {
      sanitized[key] = body[key];
    }
  }
  return sanitized;
}

function getModelBudget(model?: string): number {
  if (!model) return 0;
  const MODEL_TOKEN_LIMITS: Record<string, number> = {
    'gpt-4o': 128000, 'gpt-4o-mini': 128000, 'gpt-4-turbo': 128000, 'gpt-4': 8192,
    'gpt-3.5-turbo': 16385, 'claude-3-5-sonnet': 200000, 'claude-sonnet-4': 200000,
    'claude-3-5-haiku': 200000, 'claude-haiku-4': 200000, 'claude-3-opus': 200000,
    'claude-opus-4': 200000, 'o1': 200000, 'o1-mini': 128000, 'o3-mini': 200000,
  };
  for (const [key, limit] of Object.entries(MODEL_TOKEN_LIMITS)) {
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
  if (stats.saved <= 0 && stats.actions.length === 0) return;
  console.log(`[optimizer] ${stats.originalTokens} → ${stats.optimizedTokens} tokens (saved ${stats.saved})`);
  for (const action of stats.actions) {
    console.log(`[optimizer]   ${action}`);
  }
}
