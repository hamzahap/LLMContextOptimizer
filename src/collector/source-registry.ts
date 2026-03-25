import { SourceType, type CandidateContext, type CollectorOptions } from '../types.js';

export interface IContextSource {
  type: SourceType;
  collect(options: CollectorOptions): Promise<CandidateContext[]>;
}

export class SourceRegistry {
  private sources = new Map<SourceType, IContextSource>();

  register(source: IContextSource): void {
    this.sources.set(source.type, source);
  }

  get(type: SourceType): IContextSource | undefined {
    return this.sources.get(type);
  }

  getAll(): IContextSource[] {
    return [...this.sources.values()];
  }
}
