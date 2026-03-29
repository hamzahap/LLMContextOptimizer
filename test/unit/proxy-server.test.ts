import { createServer, request, type Server } from 'node:http';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { startProxy } from '../../src/proxy/server.js';

const ORIGINAL_FETCH = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  vi.restoreAllMocks();
});

describe('proxy server', () => {
  it('forwards small chat requests unchanged, including unknown fields', async () => {
    const forwardedBodies: string[] = [];
    globalThis.fetch = vi.fn(async (_url, init?: RequestInit) => {
      forwardedBodies.push(String(init?.body ?? ''));
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;

    const payload = {
      model: 'gpt-4o',
      messages: [{ role: 'user', content: 'hello' }],
      custom_field: { keep: true },
    };

    const port = await getFreePort();
    const server = startProxy({
      port,
      target: 'openai',
      apiKey: 'test-key',
      optimizer: {},
      verbose: false,
    });

    try {
      await waitForListening(server);
      const response = await postJson(port, '/v1/chat/completions', payload);

      expect(response.status).toBe(200);
      expect(forwardedBodies).toHaveLength(1);
      expect(forwardedBodies[0]).toBe(JSON.stringify(payload));
    } finally {
      await closeServer(server);
    }
  });

  it('preserves OpenAI responses payload input on passthrough', async () => {
    const forwardedBodies: string[] = [];
    globalThis.fetch = vi.fn(async (_url, init?: RequestInit) => {
      forwardedBodies.push(String(init?.body ?? ''));
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;

    const payload = {
      model: 'gpt-4o',
      input: [{ role: 'user', content: 'hello responses api' }],
      metadata: { tag: 'passthrough' },
    };

    const port = await getFreePort();
    const server = startProxy({
      port,
      target: 'openai',
      apiKey: 'test-key',
      optimizer: {},
      verbose: false,
    });

    try {
      await waitForListening(server);
      const response = await postJson(port, '/v1/responses', payload);

      expect(response.status).toBe(200);
      const forwarded = JSON.parse(forwardedBodies[0]) as Record<string, unknown>;
      expect(forwarded.input).toEqual(payload.input);
      expect(forwarded.metadata).toEqual(payload.metadata);
    } finally {
      await closeServer(server);
    }
  });

  it('optimizes large chat requests but keeps unrelated fields intact', async () => {
    const forwardedBodies: string[] = [];
    globalThis.fetch = vi.fn(async (_url, init?: RequestInit) => {
      forwardedBodies.push(String(init?.body ?? ''));
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;

    const repeated = 'This is a repeated message block that should be deduplicated by the optimizer because it is long enough.';
    const messages = [{ role: 'system', content: 'system prompt' }].concat(
      Array.from({ length: 20 }, () => ({ role: 'user', content: repeated })),
    );

    const payload = {
      model: 'gpt-4o',
      messages,
      custom_field: 'keep-me',
      temperature: 0,
    };

    const port = await getFreePort();
    const server = startProxy({
      port,
      target: 'openai',
      apiKey: 'test-key',
      optimizer: {},
      verbose: false,
    });

    try {
      await waitForListening(server);
      const response = await postJson(port, '/v1/chat/completions', payload);

      expect(response.status).toBe(200);
      const forwarded = JSON.parse(forwardedBodies[0]) as { messages: unknown[]; custom_field: string; temperature: number };

      expect(forwarded.custom_field).toBe('keep-me');
      expect(forwarded.temperature).toBe(0);
      expect(forwarded.messages.length).toBeLessThan(messages.length);
    } finally {
      await closeServer(server);
    }
  });

  it('optimizes OpenAI responses input safely when message shape is recognized', async () => {
    const forwardedBodies: string[] = [];
    globalThis.fetch = vi.fn(async (_url, init?: RequestInit) => {
      forwardedBodies.push(String(init?.body ?? ''));
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;

    const repeated = 'Large repeated responses input content that should trigger deduplication in optimizer path.';
    const input = Array.from({ length: 22 }, () => ({ role: 'user', content: repeated }));

    const payload = {
      model: 'gpt-4o',
      input,
      instructions: 'keep-this',
      custom_field: { keep: true },
    };

    const port = await getFreePort();
    const server = startProxy({
      port,
      target: 'openai',
      apiKey: 'test-key',
      optimizer: {},
      verbose: false,
    });

    try {
      await waitForListening(server);
      const response = await postJson(port, '/v1/responses', payload);

      expect(response.status).toBe(200);
      const forwarded = JSON.parse(forwardedBodies[0]) as { input: unknown[]; instructions: string; custom_field: { keep: boolean } };

      expect(forwarded.instructions).toBe('keep-this');
      expect(forwarded.custom_field).toEqual({ keep: true });
      expect(forwarded.input.length).toBeLessThan(input.length);
    } finally {
      await closeServer(server);
    }
  });
});

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Failed to resolve free port')));
        return;
      }

      const { port } = address;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
    server.on('error', reject);
  });
}

async function waitForListening(server: Server): Promise<void> {
  if (server.listening) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    server.once('listening', () => resolve());
    server.once('error', reject);
  });
}

async function closeServer(server: Server): Promise<void> {
  if (!server.listening) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

async function postJson(port: number, path: string, payload: unknown): Promise<{ status: number; body: string }> {
  const data = JSON.stringify(payload);

  return new Promise((resolve, reject) => {
    const req = request(
      {
        hostname: '127.0.0.1',
        port,
        path,
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(data),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        res.on('end', () => {
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      },
    );

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}
