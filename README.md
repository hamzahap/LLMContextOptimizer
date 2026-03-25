# LLM Context Optimizer

A smart preprocessing layer that sits between your raw project data and any LLM. It reduces unnecessary token usage, improves relevance, and preserves critical information by intelligently selecting, organizing, compressing, and packaging context.

**This is not a blind prompt shrinker.** The goal is maximum usefulness per token, not maximum compression.

## What It Does

Given a task description and raw context (files, errors, logs, diffs, chat history), the optimizer:

1. **Classifies** the task (bugfix, refactor, feature, review, debug, etc.)
2. **Collects** candidate context from all available sources
3. **Ranks** candidates by relevance using keyword matching, recency, dependency analysis, and task-type affinity
4. **Compresses** only the low-risk parts (deduplicates logs, summarizes boilerplate, strips comments from irrelevant files)
5. **Protects** critical evidence — stack traces, errors, schemas, and user requests are never altered
6. **Packs** everything into a structured context bundle that fits your token budget
7. **Audits** every decision so you can see what was included, excluded, and why

## Quick Example

```
$ llm-context-optimizer optimize \
    --task "Fix the auth bug where validateToken throws TypeError" \
    --files src/auth.ts src/utils.ts \
    --errors error.log \
    --logs app.log \
    --budget 4000 \
    --audit

========================================
  LLM Context Optimizer - Result
========================================

Task:       Fix the auth bug where validateToken throws TypeError
Type:       bugfix (45% confidence)
Budget:     4000 tokens
Used:       833 tokens (20.8%)
Saved:      460 tokens
Included:   4 / 4 candidates

--- Exact Evidence (Errors, Stack Traces, Test Failures) ---
TypeError: Cannot read properties of undefined (reading 'role')
    at validateToken (src/auth.ts:38:42)
    ...

--- Relevant Source Files ---
[auth.ts with interfaces preserved, boilerplate summarized]
[utils.ts summarized — not relevant to the bug]

--- Audit Summary ---
  [INCLUDED  ] error:stack-trace.txt    — immutable, kept exact
  [COMPRESSED] log:app.log              — deduplicated repeated lines
  [COMPRESSED] file:auth.ts             — summarized middle section
  [COMPRESSED] file:utils.ts            — summarized, low relevance
```

The stack trace stays **exact**. The log gets **deduplicated**. Irrelevant code gets **summarized**. Everything fits in budget.

## Proxy Mode (use with any LLM tool)

The proxy sits between your tool and the LLM API. It intercepts every request, optimizes the context, and forwards it — your tool doesn't know the difference.

```bash
# Start the proxy
llm-context-optimizer proxy --verbose

# LLM Context Optimizer Proxy running on http://localhost:4000
# All requests will be optimized before forwarding.
```

Then point your tool at the proxy:

| Tool | How to connect |
|------|---------------|
| **Codex CLI** | `OPENAI_BASE_URL=http://localhost:4000/v1 codex` |
| **Cursor** | Settings → Models → Override API Base URL → `http://localhost:4000/v1` |
| **Continue.dev** | Set `apiBase: "http://localhost:4000/v1"` in config |
| **Aider** | `aider --openai-api-base http://localhost:4000/v1` |
| **Python OpenAI SDK** | `OpenAI(base_url="http://localhost:4000/v1")` |
| **Any OpenAI-compatible tool** | Set base URL to `http://localhost:4000/v1` |
| **Anthropic tools** | Set base URL to `http://localhost:4000` |

The proxy automatically:
- Deduplicates repeated content (logs, error messages, code blocks)
- Compresses old conversation turns into summaries
- Preserves recent messages and system prompts exactly
- Removes empty messages
- Respects per-model token limits
- Streams responses back transparently

```bash
# Proxy options
llm-context-optimizer proxy \
  --port 4000 \           # Port (default: 4000)
  --target auto \         # auto, openai, or anthropic
  --preserve-last 6 \     # Keep last N messages exact
  --verbose               # Log optimization stats
```

**Note:** The proxy works with any tool that lets you configure a custom API base URL. Desktop apps that hardcode their API endpoints (ChatGPT app, Claude Desktop, GitHub Copilot) cannot be proxied.

## Installation

```bash
npm install llm-context-optimizer
```

Requires Node.js 18+.

## CLI Usage

### `optimize` — Prepare context from files and sources

```bash
# Basic usage
llm-context-optimizer optimize \
  --task "Fix the authentication bug" \
  --files src/auth.ts \
  --budget 8000

# Full options
llm-context-optimizer optimize \
  --task "Fix the auth bug where validateToken throws TypeError" \
  --files src/auth.ts src/middleware/auth.ts \
  --globs "src/models/**/*.ts" \
  --errors error.log \
  --logs app.log server.log \
  --diffs "$(git diff)" \
  --chat conversation.json \
  --budget 8000 \
  --compression moderate \
  --format text \
  --audit \
  --output context.txt
```

### `send` — Optimize and send directly to an LLM

```bash
# Send to OpenAI (streams response)
llm-context-optimizer send \
  --task "Fix the auth bug" \
  --files src/auth.ts \
  --errors error.log \
  --provider openai \
  --model gpt-4o

# Send to Anthropic Claude
llm-context-optimizer send \
  --task "Review this code for security issues" \
  --files src/auth.ts src/middleware.ts \
  --provider anthropic \
  --model claude-sonnet-4-20250514 \
  --budget 16000

# Dry run — see what would be sent without calling the API
llm-context-optimizer send \
  --task "Fix the auth bug" \
  --files src/auth.ts \
  --dry-run
```

Set API keys via environment variables:
```bash
export OPENAI_API_KEY=sk-...
export ANTHROPIC_API_KEY=sk-ant-...
```

Or pass directly with `--api-key`.

### `proxy` — Transparent optimization for any LLM tool

```bash
# Start with verbose logging
llm-context-optimizer proxy --verbose

# Custom port and target
llm-context-optimizer proxy --port 8080 --target openai
```

### Other commands

```bash
# Inspect a saved context bundle
llm-context-optimizer inspect bundle.json

# Show configuration
llm-context-optimizer config
```

### CLI Options (optimize)

| Option | Description | Default |
|--------|-------------|---------|
| `-t, --task <description>` | Task description (required) | — |
| `-f, --files <paths...>` | Source files to include | — |
| `-g, --globs <patterns...>` | Glob patterns for files | — |
| `-e, --errors <content...>` | Error messages or file paths | — |
| `-l, --logs <paths...>` | Log files | — |
| `-d, --diffs <content...>` | Diff content | — |
| `-c, --chat <path>` | Chat history file (JSON) | — |
| `-b, --budget <tokens>` | Token budget | `8000` |
| `--compression <level>` | `light`, `moderate`, or `aggressive` | `moderate` |
| `--format <type>` | `json`, `markdown`, or `text` | `text` |
| `--audit` | Show audit log | `false` |
| `--audit-file <path>` | Write audit log to file | — |
| `-o, --output <path>` | Write output to file | stdout |

### CLI Options (send)

| Option | Description | Default |
|--------|-------------|---------|
| `-p, --provider <name>` | `openai` or `anthropic` | `openai` |
| `-m, --model <name>` | Model name | per provider |
| `--api-key <key>` | API key (or use env var) | — |
| `--max-tokens <n>` | Max response tokens | `4096` |
| `--temperature <n>` | Temperature | `0` |
| `--no-stream` | Wait for full response | — |
| `--dry-run` | Show messages without sending | `false` |

Plus all the same input options as `optimize` (`--task`, `--files`, `--budget`, etc.)

### CLI Options (proxy)

| Option | Description | Default |
|--------|-------------|---------|
| `--port <port>` | Port to listen on | `4000` |
| `--target <target>` | `openai`, `anthropic`, or `auto` | `auto` |
| `--api-key <key>` | API key (or tool passes its own) | — |
| `--budget <tokens>` | Token budget override (0 = auto per model) | `0` |
| `--preserve-last <n>` | Always preserve the last N messages | `6` |
| `--verbose` | Log optimization stats per request | `false` |

## Programmatic API

```typescript
import { createPipeline } from 'llm-context-optimizer';

const pipeline = createPipeline({
  tokenBudget: 8000,
  compressionLevel: 'moderate',
});

const { bundle, auditLog } = await pipeline.run(
  'Fix the auth bug where validateToken throws TypeError',
  {
    files: ['src/auth.ts', 'src/middleware/auth.ts'],
    errors: ['error.log'],
    logs: ['app.log'],
  }
);

// Feed into any LLM
const prompt = bundle.sections.map(s => s.content).join('\n\n');

// Inspect what happened
console.log(`Used ${bundle.totalTokens} of ${bundle.metadata.tokenBudget} tokens`);
console.log(`Included ${bundle.metadata.includedCount}, excluded ${bundle.metadata.excludedCount}`);
console.log(`Saved ${bundle.metadata.compressionSavings} tokens`);
```

### Send to an LLM programmatically

```typescript
import { createPipeline, getProvider } from 'llm-context-optimizer';

const pipeline = createPipeline({ tokenBudget: 8000 });
const { bundle } = await pipeline.run('Fix the auth bug', {
  files: ['src/auth.ts'],
  errors: ['error.log'],
});

const provider = getProvider('anthropic');
for await (const chunk of provider.stream(bundle, {
  model: 'claude-sonnet-4-20250514',
  apiKey: process.env.ANTHROPIC_API_KEY!,
})) {
  process.stdout.write(chunk);
}
```

### Optimize conversation messages directly

```typescript
import { MessageOptimizer } from 'llm-context-optimizer';

const optimizer = new MessageOptimizer({
  preserveLastNTurns: 6,
  preserveFirstNTurns: 2,
});

const result = optimizer.optimize(messages, 8000);
// result.messages — optimized message array
// result.stats — { originalTokens, optimizedTokens, saved, actions }
```

### Custom Pipeline

You can swap out any module:

```typescript
import {
  OptimizePipeline,
  TaskClassifier,
  RelevanceRanker,
  CompressionEngine,
  resolveConfig,
} from 'llm-context-optimizer';

const pipeline = new OptimizePipeline(
  resolveConfig({ tokenBudget: 16000 }),
  {
    classifier: new TaskClassifier(),
    ranker: new RelevanceRanker({
      keyword: 0.5,
      recency: 0.1,
      dependency: 0.3,
      taskAffinity: 0.1,
    }),
    compression: new CompressionEngine('aggressive'),
  }
);
```

## Architecture

The optimizer is a 7-stage pipeline:

```
Input (task + raw sources)
  → Task Classifier       — identifies task type (bugfix, refactor, feature, etc.)
  → Context Collector      — gathers files, diffs, logs, errors, chat history
  → Relevance Ranker       — scores each item by keyword, recency, dependency, task affinity
  → Compression Engine     — deduplicates, summarizes, truncates, strips comments
  → Lossless Rules Engine  — protects critical content from compression
  → Context Packer         — fits items into token budget using greedy knapsack
  → Audit Layer            — records every inclusion/exclusion decision
Output (structured ContextBundle)
```

For live conversations, the **MessageOptimizer** handles message-level optimization:
- Deduplicates repeated content across messages
- Compresses old conversation turns into summaries
- Preserves system prompts and recent exchanges exactly
- Fits within per-model token limits

### Protection Levels

Every piece of context is assigned a protection level:

| Level | Meaning | Example |
|-------|---------|---------|
| **Immutable** | Never alter | Stack traces, error messages, user request |
| **Preferred** | Alter only as last resort | Diffs, schemas, interfaces, logs with errors |
| **Normal** | Standard compression allowed | Regular source files |
| **Expendable** | Drop first if budget is tight | Old chat messages, clean logs |

### Output Structure

The `ContextBundle` contains organized sections:

- **Task Description** — classified task with type, keywords, focus areas
- **Exact Evidence** — errors, stack traces, test failures (never compressed)
- **Recent Changes** — diffs
- **Relevant Source Files** — ranked and potentially compressed
- **Conversation History** — chat context
- **Log Output** — deduplicated logs

## Output Formats

### Text (default)
Human-readable format for terminal output and manual inspection.

### JSON
Structured format for piping into other tools or LLM APIs.

### Markdown
Formatted for documentation or sharing.

## Model Compatibility

Works with **any LLM** — GPT-4, Claude, Codex, Gemini, Llama, Mistral, local models, etc. The tool is completely model-agnostic:

- No LLM API calls internally (all heuristic-based, runs instantly)
- No vendor-specific formatting
- Universal token estimation (~4 chars/token for text, ~3.5 for code)

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Watch mode
npm run dev        # rebuild on change
npm run test:watch # rerun tests on change

# Type check
npm run typecheck
```

## Project Structure

```
src/
├── index.ts                 # Public API exports
├── pipeline.ts              # Pipeline orchestrator
├── types.ts                 # All shared types and interfaces
├── config.ts                # Default configuration
├── token-counter.ts         # Token estimation utility
├── classifier/              # Task classification (keyword + heuristic)
├── collector/               # Context gathering (file, diff, log, error, chat)
├── ranker/                  # Relevance scoring (keyword, recency, dependency, affinity)
├── compression/             # Safe compression (dedup, summarize, truncate, strip)
├── rules/                   # Lossless protection rules
├── packer/                  # Token budget bin-packing
├── audit/                   # Decision tracking and reporting
├── providers/               # LLM providers (OpenAI, Anthropic) for direct send
├── proxy/                   # Transparent proxy server + message optimizer
└── cli/                     # CLI commands (optimize, send, proxy, inspect, config)
```

## License

MIT
