import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

const ROOT = resolve(import.meta.dirname, '../..');
const BIN = resolve(ROOT, 'bin/llm-context-optimizer.js');

describe('CLI numeric validation', () => {
  it('rejects invalid optimize --budget values', () => {
    const result = runCli(['optimize', '--task', 't', '--budget', 'abc']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Invalid --budget');
  });

  it('rejects invalid send --temperature values', () => {
    const result = runCli(['send', '--task', 't', '--dry-run', '--temperature', 'hot']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Invalid --temperature');
  });

  it('rejects invalid proxy --port values', () => {
    const result = runCli(['proxy', '--port', '99999']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Invalid --port');
  });

  it('rejects invalid proxy --preserve-last values', () => {
    const result = runCli(['proxy', '--preserve-last', '-1']);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Invalid --preserve-last');
  });
});

function runCli(args: string[]) {
  return spawnSync(process.execPath, [BIN, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
  });
}
