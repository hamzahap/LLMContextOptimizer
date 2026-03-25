import { Command } from 'commander';
import { registerOptimizeCommand } from './commands/optimize.js';
import { registerInspectCommand } from './commands/inspect.js';
import { registerConfigCommand } from './commands/config.js';

const program = new Command();

program
  .name('llm-context-optimizer')
  .description('Intelligent context preprocessing for LLMs')
  .version('1.0.0');

registerOptimizeCommand(program);
registerInspectCommand(program);
registerConfigCommand(program);

program.parse();
