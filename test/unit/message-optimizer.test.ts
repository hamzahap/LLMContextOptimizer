import { describe, it, expect } from 'vitest';
import { MessageOptimizer } from '../../src/proxy/message-optimizer.js';

describe('MessageOptimizer', () => {
  const optimizer = new MessageOptimizer({
    preserveLastNTurns: 4,
    preserveFirstNTurns: 2,
  });

  it('removes empty messages', () => {
    const messages = [
      { role: 'system' as const, content: 'You are a helpful assistant.' },
      { role: 'user' as const, content: '' },
      { role: 'user' as const, content: 'Hello' },
    ];
    const result = optimizer.optimize(messages);
    expect(result.messages.length).toBe(2);
    expect(result.stats.actions).toContain('removed 1 empty messages');
  });

  it('deduplicates repeated log lines within a message', () => {
    const repeatedLog = Array(20).fill('2024-01-15 INFO Request received').join('\n');
    const messages = [
      { role: 'system' as const, content: 'You are a helper.' },
      { role: 'user' as const, content: `Here are the logs:\n${repeatedLog}` },
    ];
    const result = optimizer.optimize(messages);
    const content = result.messages[1].content as string;
    expect(content).toContain('repeated');
    expect(result.stats.optimizedTokens).toBeLessThan(result.stats.originalTokens);
  });

  it('deduplicates identical messages', () => {
    const dedupOptimizer = new MessageOptimizer({
      preserveLastNTurns: 0,
      preserveFirstNTurns: 0,
    });
    const messages = [
      { role: 'system' as const, content: 'You are a helper.' },
      { role: 'user' as const, content: 'Here is a very long repeated message that should be detected as duplicate content by the system' },
      { role: 'assistant' as const, content: 'Got it.' },
      { role: 'user' as const, content: 'Here is a very long repeated message that should be detected as duplicate content by the system' },
      { role: 'assistant' as const, content: 'Sure thing.' },
      { role: 'user' as const, content: 'Now do something new' },
    ];
    const result = dedupOptimizer.optimize(messages);
    expect(result.messages.length).toBeLessThan(messages.length);
  });

  it('does not drop preserved recent duplicate messages during deduplication', () => {
    const protectedOptimizer = new MessageOptimizer({
      preserveLastNTurns: 2,
      preserveFirstNTurns: 0,
    });
    const duplicate = 'target duplicate long long long long long long long long long long message';
    const messages = [
      { role: 'user' as const, content: 'older unique message' },
      { role: 'assistant' as const, content: 'assistant reply' },
      { role: 'user' as const, content: duplicate },
      { role: 'assistant' as const, content: 'assistant final' },
      { role: 'user' as const, content: duplicate },
    ];

    const result = protectedOptimizer.optimize(messages);

    expect(result.messages.slice(-2)).toEqual([
      { role: 'assistant', content: 'assistant final' },
      { role: 'user', content: duplicate },
    ]);
  });

  it('compresses old middle turns in long conversations', () => {
    const compressingOptimizer = new MessageOptimizer({
      preserveFirstNTurns: 1,
      preserveLastNTurns: 2,
    });
    const longDetails = 'Detailed explanation about architecture, constraints, edge cases, tradeoffs, examples, and follow-up considerations that should compress well. '.repeat(4);
    const messages = [
      { role: 'system' as const, content: 'You are a coding assistant.' },
      { role: 'user' as const, content: `First question about auth. ${longDetails}` },
      { role: 'assistant' as const, content: `Here is the answer about auth. ${longDetails}` },
      { role: 'user' as const, content: `Second question about database. ${longDetails}` },
      { role: 'assistant' as const, content: `Here is the answer about database. ${longDetails}` },
      { role: 'user' as const, content: `Third question about caching. ${longDetails}` },
      { role: 'assistant' as const, content: `Here is the answer about caching. ${longDetails}` },
      { role: 'user' as const, content: `Fourth question about testing. ${longDetails}` },
      { role: 'assistant' as const, content: `Here is the answer about testing. ${longDetails}` },
      { role: 'user' as const, content: `Fifth question about deployment. ${longDetails}` },
      { role: 'assistant' as const, content: `Here is the answer about deployment. ${longDetails}` },
      { role: 'user' as const, content: 'Now help me with the final thing' },
      { role: 'assistant' as const, content: 'Sure, the final answer...' },
    ];
    const result = compressingOptimizer.optimize(messages);
    // Should have fewer messages with a summary in the middle
    expect(result.messages.length).toBeLessThan(messages.length);
    // Should preserve system message
    expect(result.messages[0].content).toContain('coding assistant');
    // Should preserve last messages
    const lastMsg = result.messages[result.messages.length - 1];
    expect(lastMsg.content).toContain('final answer');
    // Should have a summary somewhere
    const summaryMsg = result.messages.find(m =>
      typeof m.content === 'string' && m.content.includes('conversation summary')
    );
    expect(summaryMsg).toBeDefined();
  });

  it('preserves all messages when under budget', () => {
    const messages = [
      { role: 'system' as const, content: 'Short system.' },
      { role: 'user' as const, content: 'Short question.' },
      { role: 'assistant' as const, content: 'Short answer.' },
    ];
    const result = optimizer.optimize(messages);
    expect(result.messages.length).toBe(3);
    expect(result.stats.saved).toBe(0);
  });

  it('reports correct stats', () => {
    const messages = [
      { role: 'system' as const, content: 'You are a helper.' },
      { role: 'user' as const, content: 'Hello' },
    ];
    const result = optimizer.optimize(messages);
    expect(result.stats.originalTokens).toBeGreaterThan(0);
    expect(result.stats.messagesOriginal).toBe(2);
    expect(result.stats.messagesOptimized).toBeGreaterThan(0);
  });

  it('fits messages within a strict token budget', () => {
    const longContent = 'x'.repeat(5000);
    const messages = [
      { role: 'system' as const, content: 'System prompt.' },
      { role: 'user' as const, content: longContent },
      { role: 'assistant' as const, content: longContent },
      { role: 'user' as const, content: longContent },
      { role: 'assistant' as const, content: longContent },
      { role: 'user' as const, content: 'Current question' },
    ];
    const result = optimizer.optimize(messages, 2000);
    expect(result.stats.optimizedTokens).toBeLessThan(result.stats.originalTokens);
  });

  it('preserves system message ordering when compressing middle turns', () => {
    const messages = [
      { role: 'system' as const, content: 'sys-1' },
      { role: 'user' as const, content: 'u-1' },
      { role: 'assistant' as const, content: 'a-1' },
      { role: 'system' as const, content: 'sys-2' },
      { role: 'user' as const, content: 'u-2' },
      { role: 'assistant' as const, content: 'a-2' },
      { role: 'user' as const, content: 'u-3' },
      { role: 'assistant' as const, content: 'a-3' },
      { role: 'user' as const, content: 'u-4' },
      { role: 'assistant' as const, content: 'a-4' },
      { role: 'user' as const, content: 'u-5' },
      { role: 'assistant' as const, content: 'a-5' },
    ];

    const result = optimizer.optimize(messages);
    const labels = result.messages.map((m) => String(m.content));
    const indexSys1 = labels.indexOf('sys-1');
    const indexSys2 = labels.indexOf('sys-2');

    expect(indexSys1).toBeGreaterThanOrEqual(0);
    expect(indexSys2).toBeGreaterThan(indexSys1);
  });

  it('transforms text blocks independently and preserves non-text blocks', () => {
    const messages = [
      {
        role: 'user' as const,
        content: [
          { type: 'text', text: 'alpha\nalpha\nalpha' },
          { type: 'image', source: 'img-1' },
          { type: 'text', text: 'beta\nbeta\nbeta' },
        ],
      },
    ];

    const result = optimizer.optimize(messages);
    const content = result.messages[0].content as Array<{ type: string; text?: string; source?: string }>;

    expect(content).toHaveLength(3);
    expect(content[0].text).toContain('repeated');
    expect(content[1]).toEqual({ type: 'image', source: 'img-1' });
    expect(content[2].text).toContain('repeated');
  });

  it('treats input_text blocks as text for counting and compression', () => {
    const messages = [
      {
        role: 'user' as const,
        content: [
          { type: 'input_text', text: 'hello\nhello\nhello' },
        ],
      },
    ];

    const result = optimizer.optimize(messages);
    const content = result.messages[0].content as Array<{ type: string; text?: string }>;

    expect(result.stats.originalTokens).toBeGreaterThan(0);
    expect(content[0].text).toContain('repeated');
  });

  it('skips middle compression when the summary would be longer', () => {
    const verboseOptimizer = new MessageOptimizer({
      preserveFirstNTurns: 0,
      preserveLastNTurns: 2,
    });
    const messages = [
      { role: 'user' as const, content: 'short one' },
      { role: 'assistant' as const, content: 'short two' },
      { role: 'user' as const, content: 'short three' },
      { role: 'assistant' as const, content: 'short four' },
      { role: 'user' as const, content: 'keep recent' },
    ];

    const result = verboseOptimizer.optimize(messages);

    expect(result.stats.actions).not.toContain('compressed 3 middle turns into summary');
    expect(result.stats.optimizedTokens).toBeLessThanOrEqual(result.stats.originalTokens);
  });
});
