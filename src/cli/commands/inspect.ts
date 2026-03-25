import { readFile } from 'node:fs/promises';
import type { Command } from 'commander';
import type { ContextBundle } from '../../types.js';

export function registerInspectCommand(program: Command): void {
  program
    .command('inspect')
    .description('Inspect a previously generated context bundle')
    .argument('<path>', 'Path to a JSON context bundle file')
    .action(async (path: string) => {
      try {
        const raw = await readFile(path, 'utf-8');
        const data = JSON.parse(raw);
        const bundle: ContextBundle = data.bundle ?? data;

        console.log('=== Context Bundle Inspection ===');
        console.log('');

        if (bundle.metadata) {
          const m = bundle.metadata;
          console.log(`Task:       ${m.taskProfile?.description ?? 'N/A'}`);
          console.log(`Type:       ${m.taskProfile?.type ?? 'N/A'}`);
          console.log(`Budget:     ${m.tokenBudget}`);
          console.log(`Included:   ${m.includedCount}`);
          console.log(`Excluded:   ${m.excludedCount}`);
          console.log(`Savings:    ${m.compressionSavings} tokens`);
          console.log('');
        }

        console.log('=== Sections ===');
        for (const section of bundle.sections ?? []) {
          console.log(`\n[${section.role}] ${section.label}`);
          console.log(`  Tokens: ${section.tokenCount}`);
          console.log(`  Sources: ${section.sources.join(', ') || 'none'}`);
          console.log(`  Preview: ${section.content.slice(0, 200)}${section.content.length > 200 ? '...' : ''}`);
        }
      } catch (error) {
        console.error('Error:', error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });
}
