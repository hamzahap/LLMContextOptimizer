import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { MessageOptimizer, type ChatMessage, type MessageOptimizerConfig } from './message-optimizer.js';

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

const MODEL_TOKEN_LIMITS: Record<string, number> = {
  'gpt-4o': 128000,
  'gpt-4o-mini': 128000,
  'gpt-4-turbo': 128000,
  'gpt-4': 8192,
  'gpt-3.5-turbo': 16385,
  'claude-3-5-sonnet': 200000,
  'claude-sonnet-4': 200000,
  'claude-3-5-haiku': 200000,
  'claude-3-opus': 200000,
  'o1': 200000,
  'o1-mini': 128000,
  'o3-mini': 200000,
};

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
      const parsed = JSON.parse(body);
      const path = req.url ?? '';

      // Detect target from path or config
      const target = detectTarget(path, config.target);
      const targetUrl = TARGET_URLS[target];
      if (!targetUrl) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `Unknown target: ${target}` }));
        return;
      }

      // Optimize messages
      const messages = extractMessages(parsed, target);
      if (messages) {
        const modelBudget = getModelBudget(parsed.model);
        const result = optimizer.optimize(messages, modelBudget);

        if (config.verbose) {
          logOptimization(result.stats);
        }

        // Replace messages in the request
        injectMessages(parsed, result.messages, target);
      }

      // Forward to real API
      const apiKey = config.apiKey
        ?? req.headers['authorization']?.replace('Bearer ', '')
        ?? req.headers['x-api-key'] as string;

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (target === 'openai') {
        headers['Authorization'] = `Bearer ${apiKey}`;
      } else if (target === 'anthropic') {
        headers['x-api-key'] = apiKey;
        headers['anthropic-version'] = (req.headers['anthropic-version'] as string) ?? '2023-06-01';
      }

      const proxyResponse = await fetch(`${targetUrl}${path}`, {
        method: req.method ?? 'POST',
        headers,
        body: JSON.stringify(parsed),
      });

      // Stream response back
      res.writeHead(proxyResponse.status, {
        'Content-Type': proxyResponse.headers.get('content-type') ?? 'application/json',
        'Transfer-Encoding': parsed.stream ? 'chunked' : undefined,
      });

      if (proxyResponse.body) {
        const reader = proxyResponse.body.getReader();
        const pump = async () => {
          while (true) {
            const { done, value } = await reader.read();
            if (done) { res.end(); return; }
            res.write(value);
          }
        };
        await pump();
      } else {
        const text = await proxyResponse.text();
        res.end(text);
      }
    } catch (error) {
      if (config.verbose) {
        console.error('[proxy] Error:', error);
      }
      res.writeHead(500, { 'Content-Type': 'application/json' });
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
    console.log('All requests will be optimized before forwarding.');
    if (config.verbose) {
      console.log('Verbose mode: optimization stats will be logged.');
    }
    console.log('');
  });
}

function detectTarget(path: string, configured: string): string {
  if (configured !== 'auto') return configured;
  if (path.includes('/v1/chat/completions') || path.includes('/v1/responses')) return 'openai';
  if (path.includes('/v1/messages')) return 'anthropic';
  return 'openai'; // Default
}

function extractMessages(body: Record<string, unknown>, target: string): ChatMessage[] | null {
  if (target === 'openai' && Array.isArray(body.messages)) {
    return body.messages as ChatMessage[];
  }
  if (target === 'anthropic') {
    const messages: ChatMessage[] = [];
    // Include system as a message for optimization
    if (body.system) {
      messages.push({ role: 'system', content: body.system as string });
    }
    if (Array.isArray(body.messages)) {
      messages.push(...(body.messages as ChatMessage[]));
    }
    return messages.length > 0 ? messages : null;
  }
  return null;
}

function injectMessages(body: Record<string, unknown>, messages: ChatMessage[], target: string): void {
  if (target === 'openai') {
    body.messages = messages;
  } else if (target === 'anthropic') {
    // Separate system back out
    const system = messages.filter(m => m.role === 'system');
    const nonSystem = messages.filter(m => m.role !== 'system');
    if (system.length > 0) {
      const systemText = system.map(m =>
        typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
      ).join('\n\n');
      body.system = systemText;
    }
    body.messages = nonSystem;
  }
}

function getModelBudget(model?: string): number {
  if (!model) return 0;
  // Check exact match or prefix match
  for (const [key, limit] of Object.entries(MODEL_TOKEN_LIMITS)) {
    if (model === key || model.startsWith(key)) {
      // Reserve 20% for the response
      return Math.floor(limit * 0.8);
    }
  }
  return 0; // Unknown model, don't enforce budget
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
  if (stats.saved === 0 && stats.actions.length === 0) return;
  console.log(`[optimizer] ${stats.originalTokens} → ${stats.optimizedTokens} tokens (saved ${stats.saved})`);
  for (const action of stats.actions) {
    console.log(`[optimizer]   ${action}`);
  }
}
