import { Injectable } from '@nestjs/common';
import { SqliteStore } from './sqlite-store';
import type {
  CreateFreezeInput,
  CreateRunInput,
  Freeze,
  ListRunsFilter,
  Run,
  RunPatch,
  Store,
} from './types';

/**
 * Nest-injectable Store, backed by better-sqlite3 for durable run history
 * (db path via HELMSMAN_DB, default data/helmsman.sqlite). Callers depend only
 * on the Store interface; MemoryStore remains for unit tests.
 */
@Injectable()
export class StoreService implements Store {
  private readonly impl: Store = new SqliteStore();

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

  createFreeze(input: CreateFreezeInput): Freeze {
    return this.impl.createFreeze(input);
  }

  listFreezes(): Freeze[] {
    return this.impl.listFreezes();
  }

  deleteFreeze(id: string): boolean {
    return this.impl.deleteFreeze(id);
  }
}
