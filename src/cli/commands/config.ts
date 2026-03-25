import type { Command } from 'commander';
import { DEFAULT_CONFIG, resolveConfig } from '../../config.js';

export function registerConfigCommand(program: Command): void {
  program
    .command('config')
    .description('Show the current configuration')
    .option('--defaults', 'Show only default values')
    .action((opts: { defaults?: boolean }) => {
      const config = opts.defaults ? DEFAULT_CONFIG : resolveConfig();
      console.log(JSON.stringify(config, null, 2));
    });
}
