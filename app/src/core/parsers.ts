import type { FileFacts, SourceFile } from '../analyzers/repo/facts';

/**
 * Where file parsing runs. The browser uses a pool of Web Workers
 * (workers/pool.ts); the Node showcase script parses in-process.
 */
export interface ParseBackend {
  parseBatch(files: SourceFile[]): Promise<FileFacts[]>;
  dispose?(): void;
}
