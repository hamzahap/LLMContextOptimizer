import { writeFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
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
  copy?: boolean;
  raw?: boolean;
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
    .option('--copy', 'Copy optimized context to clipboard', false)
    .option('--raw', 'Output only the context content (for piping to other tools)', false)
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

        // Raw mode: just output the concatenated context sections (for piping)
        if (opts.raw) {
          const raw = result.bundle.sections.map(s => s.content).join('\n\n');
          if (opts.copy) {
            copyToClipboard(raw);
            console.error(`Copied to clipboard (${result.bundle.totalTokens} tokens)`);
          }
          if (opts.output) {
            await writeFile(opts.output, raw, 'utf-8');
          } else {
            process.stdout.write(raw);
          }
          return;
        }

        const format = (opts.format ?? 'text') as OutputFormat;
        const output = formatOutput(
          format,
          result.bundle,
          opts.audit ? result.auditLog : undefined
        );

        if (opts.copy) {
          const contextOnly = result.bundle.sections.map(s => s.content).join('\n\n');
          copyToClipboard(contextOnly);
          console.error(`Copied to clipboard (${result.bundle.totalTokens} tokens)`);
        }

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

function copyToClipboard(text: string): void {
  try {
    // Works on Windows, macOS, and Linux with xclip
    const platform = process.platform;
    if (platform === 'win32') {
      execSync('clip', { input: text });
    } else if (platform === 'darwin') {
      execSync('pbcopy', { input: text });
    } else {
      execSync('xclip -selection clipboard', { input: text });
    }
  } catch {
    console.error('Warning: Could not copy to clipboard');
  }
}
