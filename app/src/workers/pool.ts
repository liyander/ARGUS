import * as Comlink from 'comlink';
import type { FileFacts, SourceFile } from '../analyzers/repo/facts';
import type { ParseBackend } from '../core/parsers';
import type { ParseWorkerApi } from './parse.worker';

/** 2–4 parse workers, round-robin. Keeps the UI at 60 fps while thousands of files parse. */
export function createWorkerPool(size = Math.min(4, Math.max(2, (navigator.hardwareConcurrency ?? 4) - 1))): ParseBackend {
  const workers = Array.from({ length: size }, () => new Worker(new URL('./parse.worker.ts', import.meta.url), { type: 'module' }));
  const remotes = workers.map((w) => Comlink.wrap<ParseWorkerApi>(w));
  const load = new Array(size).fill(0);

  return {
    async parseBatch(files: SourceFile[]): Promise<FileFacts[]> {
      // least-loaded worker
      let i = 0;
      for (let k = 1; k < size; k++) if (load[k] < load[i]) i = k;
      load[i]++;
      try {
        return await remotes[i].parseBatch(files);
      } finally {
        load[i]--;
      }
    },
    dispose() {
      workers.forEach((w) => w.terminate());
    },
  };
}
