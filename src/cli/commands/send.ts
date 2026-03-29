import { writeFile } from 'node:fs/promises';
import type { Command } from 'commander';
import { createPipeline } from '../../pipeline.js';
import { getProvider } from '../../providers/index.js';
import { bundleToMessages } from '../../providers/types.js';
import { formatAuditSummary } from '../../audit/index.js';
import { parseIntegerOption, parseNumberOption } from '../utils/number-options.js';

interface SendOptions {
  task: string;
  files?: string[];
  globs?: string[];
  diffs?: string[];
  errors?: string[];
  logs?: string[];
  chat?: string;
  budget?: string;
  compression?: string;
  provider?: string;
  model?: string;
  apiKey?: string;
  maxTokens?: string;
  temperature?: string;
  stream?: boolean;
  dryRun?: boolean;
  audit?: boolean;
  auditFile?: string;
  output?: string;
}

const DEFAULT_MODELS: Record<string, string> = {
  openai: 'gpt-4o',
  anthropic: 'claude-sonnet-4-20250514',
};

const ENV_KEYS: Record<string, string> = {
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
};

export function registerSendCommand(program: Command): void {
  program
    .command('send')
    .description('Optimize context and send to an LLM, streaming the response')
    .requiredOption('-t, --task <description>', 'Task description')
    .option('-f, --files <paths...>', 'Source files to include')
    .option('-g, --globs <patterns...>', 'Glob patterns for files')
    .option('-d, --diffs <content...>', 'Diff content or file paths')
    .option('-e, --errors <content...>', 'Error messages or file paths')
    .option('-l, --logs <paths...>', 'Log files to include')
    .option('-c, --chat <path>', 'Chat history file (JSON)')
    .option('-b, --budget <tokens>', 'Token budget', '8000')
    .option('--compression <level>', 'Compression level: light, moderate, aggressive', 'moderate')
    .option('-p, --provider <name>', 'LLM provider: openai, anthropic', 'openai')
    .option('-m, --model <name>', 'Model name (defaults per provider)')
    .option('--api-key <key>', 'API key (or set OPENAI_API_KEY / ANTHROPIC_API_KEY)')
    .option('--max-tokens <n>', 'Max response tokens', '4096')
    .option('--temperature <n>', 'Temperature', '0')
    .option('--no-stream', 'Disable streaming (wait for full response)')
    .option('--dry-run', 'Show the messages that would be sent without calling the API', false)
    .option('--audit', 'Show audit log on stderr', false)
    .option('--audit-file <path>', 'Write audit log to file')
    .option('-o, --output <path>', 'Write LLM response to file')
    .action(async (opts: SendOptions) => {
      try {
        const tokenBudget = parseIntegerOption(opts.budget ?? '8000', '--budget', { min: 1 });
        const maxTokens = parseIntegerOption(opts.maxTokens ?? '4096', '--max-tokens', { min: 1 });
        const temperature = parseNumberOption(opts.temperature ?? '0', '--temperature', { min: 0, max: 2 });

        const providerName = opts.provider ?? 'openai';
        const model = opts.model ?? DEFAULT_MODELS[providerName] ?? 'gpt-4o';

        // Resolve API key
        const envKey = ENV_KEYS[providerName];
        const apiKey = opts.apiKey ?? (envKey ? process.env[envKey] : undefined);
        if (!apiKey && !opts.dryRun) {
          console.error(`Error: No API key provided. Set ${envKey} or use --api-key`);
          process.exit(1);
        }

        // Run optimization pipeline
        const pipeline = createPipeline({
          tokenBudget,
          compressionLevel: (opts.compression as 'light' | 'moderate' | 'aggressive') ?? 'moderate',
        });

        const result = await pipeline.run(opts.task, {
          files: opts.files,
          globs: opts.globs,
          diffs: opts.diffs,
          errors: opts.errors,
          logs: opts.logs,
          chatHistory: opts.chat,
        });

        // Print optimization summary to stderr
        const meta = result.bundle.metadata;
        console.error(`[optimizer] Task: ${meta.taskProfile.type} (${(meta.taskProfile.confidence * 100).toFixed(0)}%)`);
        console.error(`[optimizer] Context: ${meta.includedCount} items, ${result.bundle.totalTokens} tokens (${result.bundle.budgetUsed.toFixed(1)}% of budget)`);
        console.error(`[optimizer] Saved: ${meta.compressionSavings} tokens`);
        console.error(`[optimizer] Sending to ${providerName}/${model}...`);
        console.error('');

        // Dry run: show messages and exit
        if (opts.dryRun) {
          const messages = bundleToMessages(result.bundle);
          console.log(JSON.stringify(messages, null, 2));
          return;
        }

        // Send to provider
        const provider = getProvider(providerName);
        const sendOpts = {
          model,
          apiKey: apiKey!,
          maxTokens,
          temperature,
          stream: opts.stream !== false,
        };

        let fullResponse = '';

        if (sendOpts.stream) {
          for await (const chunk of provider.stream(result.bundle, sendOpts)) {
            process.stdout.write(chunk);
            fullResponse += chunk;
          }
          process.stdout.write('\n');
        } else {
          fullResponse = await provider.send(result.bundle, sendOpts);
          console.log(fullResponse);
        }

        // Save response to file
        if (opts.output) {
          await writeFile(opts.output, fullResponse, 'utf-8');
          console.error(`\nResponse written to ${opts.output}`);
        }

        // Audit
        if (opts.audit) {
          console.error('\n' + formatAuditSummary(result.auditLog));
        }
        if (opts.auditFile) {
          await writeFile(opts.auditFile, formatAuditSummary(result.auditLog), 'utf-8');
          console.error(`Audit log written to ${opts.auditFile}`);
        }
      } catch (error) {
        console.error('Error:', error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });
}
