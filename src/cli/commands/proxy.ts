import type { Command } from 'commander';
import { startProxy } from '../../proxy/server.js';
import { parseIntegerOption } from '../utils/number-options.js';

interface ProxyOptions {
  port?: string;
  target?: string;
  apiKey?: string;
  budget?: string;
  preserveLast?: string;
  verbose?: boolean;
}

export function registerProxyCommand(program: Command): void {
  program
    .command('proxy')
    .description('Start a local proxy that optimizes context for any LLM tool')
    .option('--port <port>', 'Port to listen on', '4000')
    .option('--target <target>', 'API target: openai, anthropic, or auto', 'auto')
    .option('--api-key <key>', 'API key (or tool passes its own)')
    .option('--budget <tokens>', 'Token budget override (0 = auto per model)', '0')
    .option('--preserve-last <n>', 'Always preserve the last N messages', '6')
    .option('--verbose', 'Log optimization stats for each request', false)
    .action((opts: ProxyOptions) => {
      try {
        const port = parseIntegerOption(opts.port ?? '4000', '--port', { min: 1, max: 65535 });
        const budget = parseIntegerOption(opts.budget ?? '0', '--budget', { min: 0 });
        const preserveLast = parseIntegerOption(opts.preserveLast ?? '6', '--preserve-last', { min: 0 });

        startProxy({
          port,
          target: (opts.target as 'openai' | 'anthropic' | 'auto') ?? 'auto',
          apiKey: opts.apiKey ?? process.env.OPENAI_API_KEY ?? process.env.ANTHROPIC_API_KEY,
          optimizer: {
            tokenBudget: budget,
            preserveLastNTurns: preserveLast,
          },
          verbose: opts.verbose ?? false,
        });
      } catch (error) {
        console.error('Error:', error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });
}
