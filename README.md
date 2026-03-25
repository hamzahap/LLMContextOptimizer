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

## Installation

```bash
npm install llm-context-optimizer
```

Requires Node.js 18+.

## CLI Usage

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

# Inspect a saved bundle
llm-context-optimizer inspect bundle.json

# Show configuration
llm-context-optimizer config
```

### CLI Options

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

### Custom Pipeline

You can swap out any module:

```typescript
import {
  OptimizePipeline,
  TaskClassifier,
  ContextCollector,
  RelevanceRanker,
  CompressionEngine,
  LosslessRulesEngine,
  ContextPacker,
  AuditLayer,
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
    // ...other modules
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
└── cli/                     # CLI commands and output formatters
```

## License

MIT
