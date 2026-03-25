import type { IContextCollector, CandidateContext, CollectorOptions } from '../types.js';
import { SourceRegistry } from './source-registry.js';
import { FileSource } from './sources/file-source.js';
import { DiffSource } from './sources/diff-source.js';
import { LogSource } from './sources/log-source.js';
import { ErrorSource } from './sources/error-source.js';
import { ChatSource } from './sources/chat-source.js';

export class ContextCollector implements IContextCollector {
  private registry: SourceRegistry;

  constructor(registry?: SourceRegistry) {
    this.registry = registry ?? createDefaultRegistry();
  }

  async collect(options: CollectorOptions): Promise<CandidateContext[]> {
    const allCandidates: CandidateContext[] = [];

    // Collect from all registered sources in parallel
    const sources = this.registry.getAll();
    const results = await Promise.all(
      sources.map(source => source.collect(options).catch(() => [] as CandidateContext[]))
    );

    for (const candidates of results) {
      allCandidates.push(...candidates);
    }

    return allCandidates;
  }

  getRegistry(): SourceRegistry {
    return this.registry;
  }
}

function createDefaultRegistry(): SourceRegistry {
  const registry = new SourceRegistry();
  registry.register(new FileSource());
  registry.register(new DiffSource());
  registry.register(new LogSource());
  registry.register(new ErrorSource());
  registry.register(new ChatSource());
  return registry;
}
