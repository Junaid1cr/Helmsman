import { Injectable } from '@nestjs/common';
import { MemoryStore } from './memory-store';
import type { CreateRunInput, ListRunsFilter, Run, RunPatch, Store } from './types';

/**
 * Nest-injectable Store. Delegates to MemoryStore today; at step 6 the backing
 * impl becomes better-sqlite3 — callers depend only on this interface.
 */
@Injectable()
export class StoreService implements Store {
  private readonly impl: Store = new MemoryStore();

  createRun(input: CreateRunInput): Run {
    return this.impl.createRun(input);
  }

  updateRun(id: string, patch: RunPatch): Run {
    return this.impl.updateRun(id, patch);
  }

  getRun(id: string): Run | undefined {
    return this.impl.getRun(id);
  }

  listRuns(filter?: ListRunsFilter): Run[] {
    return this.impl.listRuns(filter);
  }
}
