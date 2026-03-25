import { execSync } from 'node:child_process';
import type { Command } from 'commander';
import { countTokens } from '../../token-counter.js';
import { deduplicateLines } from '../../compression/techniques/dedup.js';
import { summarizeBlock } from '../../compression/techniques/summarizer.js';
import { truncateContent } from '../../compression/techniques/truncator.js';
import { stripComments } from '../../compression/techniques/comment-stripper.js';

interface ClipOptions {
  watch?: boolean;
  budget?: string;
  interval?: string;
}

export function registerClipCommand(program: Command): void {
  program
    .command('clip')
    .description('Optimize clipboard contents for pasting into any LLM chat')
    .option('-w, --watch', 'Watch clipboard and auto-optimize when content changes', false)
    .option('-b, --budget <tokens>', 'Max token budget', '8000')
    .option('-i, --interval <ms>', 'Watch polling interval in ms', '1000')
    .action((opts: ClipOptions) => {
      if (opts.watch) {
        watchClipboard(parseInt(opts.budget ?? '8000', 10), parseInt(opts.interval ?? '1000', 10));
      } else {
        optimizeClipboardOnce(parseInt(opts.budget ?? '8000', 10));
      }
    });
}

function optimizeClipboardOnce(budget: number): void {
  const content = readClipboard();
  if (!content || content.trim().length === 0) {
    console.log('Clipboard is empty.');
    return;
  }

  const originalTokens = countTokens(content);
  if (originalTokens <= budget * 0.5) {
    console.log(`Clipboard is small enough (${originalTokens} tokens). No optimization needed.`);
    return;
  }

  const result = optimizeText(content, budget);
  writeClipboard(result.text);

  console.log(`Optimized clipboard:`);
  console.log(`  Before: ${originalTokens} tokens`);
  console.log(`  After:  ${result.tokens} tokens`);
  console.log(`  Saved:  ${originalTokens - result.tokens} tokens (${((1 - result.tokens / originalTokens) * 100).toFixed(0)}%)`);
  if (result.actions.length > 0) {
    console.log(`  Actions: ${result.actions.join(', ')}`);
  }
  console.log('');
  console.log('Paste into your LLM chat now.');
}

function watchClipboard(budget: number, interval: number): void {
  console.log('Watching clipboard for large content...');
  console.log(`Budget: ${budget} tokens | Poll: every ${interval}ms`);
  console.log('Copy something and it will be auto-optimized.');
  console.log('Press Ctrl+C to stop.');
  console.log('');

  let lastContent = '';

  setInterval(() => {
    try {
      const content = readClipboard();
      if (!content || content === lastContent) return;
      lastContent = content;

      const tokens = countTokens(content);
      if (tokens <= budget * 0.3) return; // Small enough, skip

      const result = optimizeText(content, budget);
      if (result.tokens >= tokens) return; // Nothing to optimize

      writeClipboard(result.text);
      lastContent = result.text;

      const timestamp = new Date().toLocaleTimeString();
      console.log(`[${timestamp}] Optimized: ${tokens} → ${result.tokens} tokens (saved ${tokens - result.tokens})`);
      if (result.actions.length > 0) {
        console.log(`  ${result.actions.join(', ')}`);
      }
    } catch {
      // Ignore clipboard read errors
    }
  }, interval);
}

interface OptimizeResult {
  text: string;
  tokens: number;
  actions: string[];
}

function optimizeText(content: string, budget: number): OptimizeResult {
  const actions: string[] = [];
  let text = content;

  // 1. Deduplicate repeated lines (common in logs)
  const deduped = deduplicateLines(text);
  if (deduped.applied) {
    text = deduped.result;
    actions.push('deduplicated repeated lines');
  }

  // 2. Strip comments if it looks like code
  if (looksLikeCode(text)) {
    const stripped = stripComments(text, guessExtension(text));
    if (stripped.applied) {
      text = stripped.result;
      actions.push('stripped code comments');
    }
  }

  // 3. Summarize if still too long
  const tokens = countTokens(text);
  if (tokens > budget) {
    const summarized = summarizeBlock(text, {
      maxLines: Math.floor(budget / 5), // rough estimate
      keepFirst: 30,
      keepLast: 30,
    });
    if (summarized.applied) {
      text = summarized.result;
      actions.push('summarized long content');
    }
  }

  // 4. Truncate as last resort
  if (countTokens(text) > budget) {
    const truncated = truncateContent(text, { maxTokens: budget });
    if (truncated.applied) {
      text = truncated.result;
      actions.push('truncated to fit budget');
    }
  }

  return { text, tokens: countTokens(text), actions };
}

function looksLikeCode(text: string): boolean {
  const codePatterns = [/^import\s/m, /^export\s/m, /^function\s/m, /^class\s/m, /^const\s/m, /[{};]\s*$/m];
  let matches = 0;
  for (const p of codePatterns) {
    if (p.test(text)) matches++;
  }
  return matches >= 2;
}

function guessExtension(text: string): string {
  if (/^import\s.*from\s/m.test(text)) return 'file.ts';
  if (/^from\s+\S+\s+import/m.test(text)) return 'file.py';
  if (/^package\s/m.test(text)) return 'file.java';
  return 'file.ts';
}

function readClipboard(): string {
  try {
    const platform = process.platform;
    if (platform === 'win32') {
      return execSync('powershell -command "Get-Clipboard"', { encoding: 'utf-8' });
    } else if (platform === 'darwin') {
      return execSync('pbpaste', { encoding: 'utf-8' });
    } else {
      return execSync('xclip -selection clipboard -o', { encoding: 'utf-8' });
    }
  } catch {
    return '';
  }
}

function writeClipboard(text: string): void {
  try {
    const platform = process.platform;
    if (platform === 'win32') {
      execSync('clip', { input: text });
    } else if (platform === 'darwin') {
      execSync('pbcopy', { input: text });
    } else {
      execSync('xclip -selection clipboard', { input: text });
    }
  } catch {
    console.error('Warning: Could not write to clipboard');
  }
}
