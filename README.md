# LLM Context Optimizer

A local-first context preparation tool for LLM workflows.

It helps you turn raw project inputs such as files, diffs, logs, errors, and chat history into a smaller, more structured prompt bundle. The goal is not maximum compression. The goal is better usefulness per token.

## What It Does

Given a task description and raw context, the optimizer:

1. Classifies the task.
2. Collects candidate inputs from files, diffs, logs, errors, and chat history.
3. Ranks those inputs by relevance.
4. Compresses lower-risk content.
5. Preserves critical evidence such as stack traces and error output.
6. Packs the final result into a token budget.
7. Produces an audit log explaining what happened.

For conversation-style requests, the project also includes a `MessageOptimizer` and a local proxy that can optimize supported API request shapes before forwarding them upstream.

## Project Scope

There are three separate usage modes:

- `optimize`: local heuristic preprocessing only. No API call is made.
- `send`: optimizes locally, then sends the result to OpenAI or Anthropic.
- `proxy`: runs a local HTTP proxy that optimizes supported request bodies, then forwards them to the upstream API.

That distinction matters:

- The core optimizer is model-agnostic.
- The `send` and `proxy` features are not model-agnostic in the same sense because they implement provider-specific API behavior.

## Quick Example

```bash
llm-context-optimizer optimize \
  --task "Fix the auth bug where validateToken throws TypeError" \
  --files src/auth.ts src/utils.ts \
  --errors error.log \
  --logs app.log \
  --budget 4000 \
  --audit
```

Typical outcome:

- Stack traces stay exact.
- Repeated log lines are deduplicated.
- Lower-value code sections may be summarized.
- The final context stays within the configured token budget when possible.

## Proxy Mode

The proxy sits between your tool and the upstream LLM API. It can optimize supported request shapes and forward everything else unchanged.

Start it with:

```bash
llm-context-optimizer proxy --verbose
```

Then point your tool at:

- OpenAI-style base URL: `http://localhost:4000/v1`
- Anthropic-style base URL: `http://localhost:4000`

Examples:

| Tool | How to connect |
|------|----------------|
| Codex CLI | `OPENAI_BASE_URL=http://localhost:4000/v1 codex` |
| Cursor | Override the API base URL to `http://localhost:4000/v1` |
| Continue.dev | Set `apiBase: "http://localhost:4000/v1"` |
| Aider | `aider --openai-api-base http://localhost:4000/v1` |
| Python OpenAI SDK | `OpenAI(base_url="http://localhost:4000/v1")` |

Supported optimization targets:

- OpenAI `POST /v1/chat/completions`
- OpenAI `POST /v1/responses` when `input` is recognized as message-shaped text content
- Anthropic `POST /v1/messages`

Other endpoints are forwarded as passthrough requests.

Current proxy behavior:

- Deduplicates repeated content in supported message payloads
- Compresses older conversation turns when useful
- Preserves configured recent turns and system messages
- Removes empty messages
- Uses model budgets when available
- Streams responses back to the client

## Installation

```bash
npm install llm-context-optimizer
```

Requires Node.js 18+.

## CLI Usage

### `optimize`

Prepare context locally from files and other sources.

```bash
llm-context-optimizer optimize \
  --task "Fix the authentication bug" \
  --files src/auth.ts \
  --budget 8000
```

Full example:

```bash
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

Options:

| Option | Description | Default |
|--------|-------------|---------|
| `-t, --task <description>` | Task description | required |
| `-f, --files <paths...>` | Source files to include | none |
| `-g, --globs <patterns...>` | Glob patterns for files | none |
| `-d, --diffs <content...>` | Diff content or file paths | none |
| `-e, --errors <content...>` | Error messages or file paths | none |
| `-l, --logs <paths...>` | Log files to include | none |
| `-c, --chat <path>` | Chat history file or inline JSON | none |
| `-b, --budget <tokens>` | Token budget | `8000` |
| `--compression <level>` | `light`, `moderate`, `aggressive` | `moderate` |
| `--format <type>` | `json`, `markdown`, `text` | `text` |
| `--audit` | Show audit log in output | `false` |
| `--audit-file <path>` | Write audit log to file | none |
| `-o, --output <path>` | Write formatted output to file | stdout |
| `--copy` | Copy optimized context to clipboard | `false` |
| `--raw` | Output only concatenated context content | `false` |

### `send`

Optimize locally, then send the result to a provider.

```bash
llm-context-optimizer send \
  --task "Fix the auth bug" \
  --files src/auth.ts \
  --errors error.log \
  --provider openai \
  --model gpt-4o
```

Anthropic example:

```bash
llm-context-optimizer send \
  --task "Review this code for security issues" \
  --files src/auth.ts src/middleware.ts \
  --provider anthropic \
  --model claude-sonnet-4-20250514 \
  --budget 16000
```

Dry run example:

```bash
llm-context-optimizer send \
  --task "Fix the auth bug" \
  --files src/auth.ts \
  --dry-run
```

Environment variables:

```bash
export OPENAI_API_KEY=sk-...
export ANTHROPIC_API_KEY=sk-ant-...
```

Options:

| Option | Description | Default |
|--------|-------------|---------|
| `-p, --provider <name>` | `openai` or `anthropic` | `openai` |
| `-m, --model <name>` | Model name | provider default |
| `--api-key <key>` | API key override | env var |
| `--max-tokens <n>` | Max response tokens | `4096` |
| `--temperature <n>` | Temperature | `0` |
| `--no-stream` | Disable streaming | `false` |
| `--dry-run` | Print messages without calling the API | `false` |
| `--audit` | Print audit log to stderr | `false` |
| `--audit-file <path>` | Write audit log to file | none |
| `-o, --output <path>` | Write model response to file | stdout |

`send` also supports the same context-input flags as `optimize`.

### `proxy`

Start the local optimization proxy.

```bash
llm-context-optimizer proxy --verbose
```

```bash
llm-context-optimizer proxy --port 8080 --target openai
```

Options:

| Option | Description | Default |
|--------|-------------|---------|
| `--port <port>` | Port to listen on | `4000` |
| `--target <target>` | `openai`, `anthropic`, or `auto` | `auto` |
| `--api-key <key>` | Override upstream API key | none |
| `--budget <tokens>` | Token budget override, `0` means auto | `0` |
| `--preserve-last <n>` | Always preserve the last N messages | `6` |
| `--verbose` | Log proxy optimization decisions | `false` |

### Other Commands

```bash
llm-context-optimizer inspect bundle.json
llm-context-optimizer config
```

## Programmatic API

### Pipeline

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

console.log(bundle.totalTokens);
console.log(auditLog.summary);
```

### Provider Send

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

### Message Optimizer

```typescript
import { MessageOptimizer } from 'llm-context-optimizer';

const optimizer = new MessageOptimizer({
  preserveLastNTurns: 6,
  preserveFirstNTurns: 2,
});

const result = optimizer.optimize(messages, 8000);
console.log(result.messages);
console.log(result.stats);
```

## Architecture

Pipeline stages:

```text
Input (task + raw sources)
  -> Task Classifier
  -> Context Collector
  -> Relevance Ranker
  -> Compression Engine
  -> Lossless Rules Engine
  -> Context Packer
  -> Audit Layer
Output (structured ContextBundle)
```

For conversation optimization, `MessageOptimizer` works at the message level:

- Deduplicates repeated content
- Compresses older turns when useful
- Preserves configured recent turns and system prompts
- Fits output to a token budget when one is provided

## Model Compatibility

The core pipeline is model-agnostic:

- No LLM API calls are required for `optimize`
- Output is plain structured text or JSON
- Token counting uses rough heuristics, not provider tokenizers

Provider-specific behavior exists in:

- `send`
- `providers/*`
- `proxy`

## Development

```bash
npm install
npm test
npm run typecheck
npm run lint
npm run build
```

## Project Structure

```text
src/
|- index.ts
|- pipeline.ts
|- types.ts
|- config.ts
|- token-counter.ts
|- classifier/
|- collector/
|- ranker/
|- compression/
|- rules/
|- packer/
|- audit/
|- providers/
|- proxy/
`- cli/
```

## License

MIT
