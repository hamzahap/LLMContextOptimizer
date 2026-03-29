import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { createPipeline } from '../../src/pipeline.js';

const FIXTURES = resolve(import.meta.dirname, '../fixtures');

describe('OptimizePipeline', () => {
  it('runs a full optimization pipeline', async () => {
    const pipeline = createPipeline({
      tokenBudget: 4000,
      compressionLevel: 'moderate',
    });

    const result = await pipeline.run('Fix the authentication bug where validateToken throws TypeError', {
      files: [
        resolve(FIXTURES, 'sample-files/auth.ts'),
        resolve(FIXTURES, 'sample-files/utils.ts'),
      ],
      errors: [resolve(FIXTURES, 'sample-errors/stack-trace.txt')],
      logs: [resolve(FIXTURES, 'sample-logs/app.log')],
      diffs: [
        `diff --git a/src/auth.ts b/src/auth.ts\n--- a/src/auth.ts\n+++ b/src/auth.ts\n@@ -35,7 +35,10 @@\n-  return verify(token, JWT_SECRET) as AuthToken;\n+  try {\n+    return verify(token, JWT_SECRET) as AuthToken;\n+  } catch (err) {\n+    throw new Error('Invalid or expired token');\n+  }`,
      ],
    });

    // Should produce a valid bundle
    expect(result.bundle).toBeDefined();
    expect(result.bundle.sections.length).toBeGreaterThan(0);
    expect(result.bundle.totalTokens).toBeGreaterThan(0);
    expect(result.bundle.totalTokens).toBeLessThanOrEqual(4000 * 1.2); // Allow some flex for immutable items

    // Should have metadata
    expect(result.bundle.metadata.taskProfile.type).toBeDefined();
    expect(result.bundle.metadata.includedCount).toBeGreaterThan(0);

    // Should have audit log
    expect(result.auditLog).toBeDefined();
    expect(result.auditLog.entries.length).toBeGreaterThan(0);
    expect(result.auditLog.summary.totalCandidates).toBeGreaterThan(0);
  });

  it('handles empty input gracefully', async () => {
    const pipeline = createPipeline({ tokenBudget: 1000 });

    const result = await pipeline.run('Do something', {});

    expect(result.bundle).toBeDefined();
    expect(result.bundle.sections.length).toBeGreaterThan(0); // At least the task section
    expect(result.auditLog).toBeDefined();
  });

  it('preserves error content exactly', async () => {
    const pipeline = createPipeline({ tokenBudget: 8000 });

    const errorContent = 'TypeError: Cannot read properties of undefined (reading "role")\n    at validateToken (src/auth.ts:38:42)';
    const result = await pipeline.run('Fix this error', {
      errors: [errorContent],
    });

    // The error content should appear in the bundle unchanged
    const allContent = result.bundle.sections.map(s => s.content).join('\n');
    expect(allContent).toContain('TypeError: Cannot read properties');
    expect(allContent).toContain('validateToken');
  });

  it('classifies tasks correctly in the pipeline', async () => {
    const pipeline = createPipeline({ tokenBudget: 2000 });

    const result = await pipeline.run('Refactor the user module to extract validation', {});
    expect(result.bundle.metadata.taskProfile.type).toBe('refactor');
  });

  it('does not accumulate audit entries across multiple runs', async () => {
    const pipeline = createPipeline({ tokenBudget: 1000 });
    const file = resolve(FIXTURES, 'sample-files/auth.ts');

    const first = await pipeline.run('First task', { files: [file] });
    const second = await pipeline.run('Second task', { files: [file] });

    expect(first.auditLog.summary.totalCandidates).toBe(1);
    expect(second.auditLog.summary.totalCandidates).toBe(1);
    expect(second.auditLog.entries).toHaveLength(1);
  });
});
