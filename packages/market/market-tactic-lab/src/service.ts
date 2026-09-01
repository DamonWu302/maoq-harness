import { Context, Service } from '@deepseek-ai/cordis'
import type {
  TacticLabHistoryAdapter,
  TacticLabHistoryChunk,
  TacticLabHistoryRequest,
} from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    marketTacticHistory: TacticLabHistoryService
  }
}

/** Registry boundary between production history providers and research consumers. */
export class TacticLabHistoryService extends Service {
  constructor(ctx: Context) {
    super(ctx, 'marketTacticHistory')
  }

  private readonly adapters = new Map<string, TacticLabHistoryAdapter>()

  /**
   * Register one history provider until its contributor is disposed.
   * @param adapter - Provider with a unique lowercase-hyphenated name.
   * @returns Disposer for this exact registration.
   */
  register(adapter: TacticLabHistoryAdapter): () => void {
    if (!/^[a-z][a-z0-9-]*$/u.test(adapter.name)) {
      throw new TypeError(`tactic history adapter name ${JSON.stringify(adapter.name)} must be lowercase hyphenated`)
    }
    if (this.adapters.has(adapter.name)) throw new Error(`tactic history adapter "${adapter.name}" is already registered`)
    this.adapters.set(adapter.name, adapter)
    return () => {
      if (this.adapters.get(adapter.name) === adapter) this.adapters.delete(adapter.name)
    }
  }

  /**
   * List exact registered source names in deterministic order.
   * @returns Sorted provider names.
   */
  listAdapters(): readonly string[] {
    return [...this.adapters.keys()].sort()
  }

  /**
   * Stream verified provider-neutral history from one exact registered source.
   * @param adapterName - Exact registered provider name.
   * @param request - Inclusive date range and bounded chunk/quality requirements.
   * @returns Provider-owned asynchronous chunk stream.
   */
  load(adapterName: string, request: TacticLabHistoryRequest): AsyncIterable<TacticLabHistoryChunk> {
    const adapter = this.adapters.get(adapterName)
    if (adapter === undefined) throw new Error(`tactic history adapter "${adapterName}" is not registered`)
    return adapter.load(request)
  }

  /**
   * Resolve one exact provider for a host-side evaluator.
   * @param adapterName - Exact registered provider name.
   * @returns Registered immutable-history adapter.
   */
  getAdapter(adapterName: string): TacticLabHistoryAdapter {
    const adapter = this.adapters.get(adapterName)
    if (adapter === undefined) throw new Error(`tactic history adapter "${adapterName}" is not registered`)
    return adapter
  }
}

export default TacticLabHistoryService
