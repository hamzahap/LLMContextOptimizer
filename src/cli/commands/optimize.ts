import { writeFile } from 'node:fs/promises';
import type { Command } from 'commander';
import { createPipeline } from '../../pipeline.js';
import { formatOutput, type OutputFormat } from '../formatters/index.js';
import { formatAuditSummary } from '../../audit/index.js';

interface OptimizeOptions {
  task: string;
  files?: string[];
  globs?: string[];
  diffs?: string[];
  errors?: string[];
  logs?: string[];
  chat?: string;
  budget?: string;
  compression?: string;
  format?: string;
  audit?: boolean;
  auditFile?: string;
  output?: string;
}

export function registerOptimizeCommand(program: Command): void {
  program
    .command('optimize')
    .description('Optimize context for an LLM task')
    .requiredOption('-t, --task <description>', 'Task description')
    .option('-f, --files <paths...>', 'Source files to include')
    .option('-g, --globs <patterns...>', 'Glob patterns for files')
    .option('-d, --diffs <content...>', 'Diff content or file paths')
    .option('-e, --errors <content...>', 'Error messages or file paths')
    .option('-l, --logs <paths...>', 'Log files to include')
    .option('-c, --chat <path>', 'Chat history file (JSON)')
    .option('-b, --budget <tokens>', 'Token budget', '8000')
    .option('--compression <level>', 'Compression level: light, moderate, aggressive', 'moderate')
    .option('--format <type>', 'Output format: json, markdown, text', 'text')
    .option('--audit', 'Show audit log', false)
    .option('--audit-file <path>', 'Write audit log to file')
    .option('-o, --output <path>', 'Write output to file instead of stdout')
    .action(async (opts: OptimizeOptions) => {
      try {
        const pipeline = createPipeline({
          tokenBudget: parseInt(opts.budget ?? '8000', 10),
          compressionLevel: (opts.compression as 'light' | 'moderate' | 'aggressive') ?? 'moderate',
          outputFormat: (opts.format as OutputFormat) ?? 'text',
        });

        const result = await pipeline.run(opts.task, {
          files: opts.files,
          globs: opts.globs,
          diffs: opts.diffs,
          errors: opts.errors,
          logs: opts.logs,
          chatHistory: opts.chat,
        });

        const format = (opts.format ?? 'text') as OutputFormat;
        const output = formatOutput(
          format,
          result.bundle,
          opts.audit ? result.auditLog : undefined
        );

        if (opts.output) {
          await writeFile(opts.output, output, 'utf-8');
          console.log(`Output written to ${opts.output}`);
        } else {
          console.log(output);
        }

        if (opts.auditFile) {
          const auditOutput = formatAuditSummary(result.auditLog);
          await writeFile(opts.auditFile, auditOutput, 'utf-8');
          console.error(`Audit log written to ${opts.auditFile}`);
        }
      } catch (error) {
        console.error('Error:', error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });
}
