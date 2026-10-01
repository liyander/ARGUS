import * as Comlink from 'comlink';
import { parseBatch } from '../analyzers/repo/parse-file';

/** AST parsing off the main thread. A small pool of these runs in parallel. */
const api = { parseBatch };
export type ParseWorkerApi = typeof api;

Comlink.expose(api);
