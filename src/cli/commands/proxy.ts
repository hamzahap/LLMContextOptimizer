import type { Command } from 'commander';
import { startProxy } from '../../proxy/server.js';

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
      const port = parseInt(opts.port ?? '4000', 10);
      const budget = parseInt(opts.budget ?? '0', 10);
      const preserveLast = parseInt(opts.preserveLast ?? '6', 10);

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
    });
}
