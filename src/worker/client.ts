import * as Comlink from 'comlink';
import type { EngineApi } from './api';

let instance: Comlink.Remote<EngineApi> | null = null;

/** Lazily-started engine worker shared by the whole app. */
export function engine(): Comlink.Remote<EngineApi> {
  if (!instance) {
    const worker = new Worker(new URL('./engine.worker.ts', import.meta.url), { type: 'module' });
    instance = Comlink.wrap<EngineApi>(worker);
  }
  return instance;
}
