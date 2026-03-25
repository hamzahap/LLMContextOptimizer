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
    const messages = [
      { role: 'system' as const, content: 'You are a helper.' },
      { role: 'user' as const, content: 'Here is a very long repeated message that should be detected as duplicate content by the system' },
      { role: 'assistant' as const, content: 'Got it.' },
      { role: 'user' as const, content: 'Here is a very long repeated message that should be detected as duplicate content by the system' },
      { role: 'assistant' as const, content: 'Sure thing.' },
      { role: 'user' as const, content: 'Now do something new' },
    ];
    const result = optimizer.optimize(messages);
    expect(result.messages.length).toBeLessThan(messages.length);
  });

  it('compresses old middle turns in long conversations', () => {
    const messages = [
      { role: 'system' as const, content: 'You are a coding assistant.' },
      { role: 'user' as const, content: 'First question about auth' },
      { role: 'assistant' as const, content: 'Here is the answer about auth...' },
      { role: 'user' as const, content: 'Second question about database' },
      { role: 'assistant' as const, content: 'Here is the answer about database...' },
      { role: 'user' as const, content: 'Third question about caching' },
      { role: 'assistant' as const, content: 'Here is the answer about caching...' },
      { role: 'user' as const, content: 'Fourth question about testing' },
      { role: 'assistant' as const, content: 'Here is the answer about testing...' },
      { role: 'user' as const, content: 'Fifth question about deployment' },
      { role: 'assistant' as const, content: 'Here is the answer about deployment...' },
      { role: 'user' as const, content: 'Now help me with the final thing' },
      { role: 'assistant' as const, content: 'Sure, the final answer...' },
    ];
    const result = optimizer.optimize(messages);
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
});
