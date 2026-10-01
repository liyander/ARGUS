import { create } from 'zustand';
import { loadAnalysis, saveAnalysis } from '../core/cache';
import { clearContents } from '../core/content';
import type { Analysis, GraphEdge, GraphNode, LogLevel, LogLine } from '../core/model';
import { runAnalysis, type AnalysisInput } from '../core/pipeline';
import { loadShowcase } from '../core/showcase';
import { createWorkerPool } from '../workers/pool';

export type Status = 'idle' | 'loading' | 'running' | 'done' | 'error';
export type Source = 'live' | 'cache' | 'showcase';

export interface Indexes {
  byId: Map<string, GraphNode>;
  out: Map<string, GraphEdge[]>;
  in: Map<string, GraphEdge[]>;
}

function buildIndexes(a: Analysis | null): Indexes {
  const byId = new Map<string, GraphNode>();
  const out = new Map<string, GraphEdge[]>();
  const inn = new Map<string, GraphEdge[]>();
  if (!a) return { byId, out, in: inn };
  for (const n of a.nodes) byId.set(n.id, n);
  for (const e of a.edges) {
    if (!out.has(e.source)) out.set(e.source, []);
    out.get(e.source)!.push(e);
    if (!inn.has(e.target)) inn.set(e.target, []);
    inn.get(e.target)!.push(e);
  }
  return { byId, out, in: inn };
}

interface AnalysisState {
  input: AnalysisInput | null;
  status: Status;
  source: Source;
  savedAt: string | null;
  analysis: Analysis | null;
  idx: Indexes;
  log: LogLine[];
  progress: { fraction: number; label: string };
  error: string | null;
  rateLimited: boolean;
  selectedId: string | null;
  focusMode: boolean;
  controller: AbortController | null;

  open: (input: AnalysisInput, opts?: { force?: boolean }) => Promise<void>;
  cancel: () => void;
  select: (id: string | null) => void;
  toggleFocus: (on?: boolean) => void;
  reset: () => void;
}

const startT = { t: 0 };

export const useAnalysis = create<AnalysisState>((set, get) => ({
  input: null,
  status: 'idle',
  source: 'live',
  savedAt: null,
  analysis: null,
  idx: buildIndexes(null),
  log: [],
  progress: { fraction: 0, label: '' },
  error: null,
  rateLimited: false,
  selectedId: null,
  focusMode: false,
  controller: null,

  async open(input, opts = {}) {
    const cur = get();
    if (!opts.force && cur.input?.mode === input.mode && cur.input.target === input.target && cur.status !== 'error' && cur.status !== 'idle') return;
    cur.controller?.abort();
    const controller = new AbortController();
    set({ input, status: 'loading', analysis: null, idx: buildIndexes(null), log: [], error: null, rateLimited: false, selectedId: null, controller, progress: { fraction: 0, label: '' } });

    // 1. instant: IndexedDB cache, then the pre-computed showcase
    if (!opts.force) {
      const cached = await loadAnalysis(input.mode, input.target);
      if (get().controller !== controller) return;
      if (cached) {
        set({ analysis: cached.analysis, idx: buildIndexes(cached.analysis), status: 'done', source: 'cache', savedAt: cached.savedAt, progress: { fraction: 1, label: 'Cached' } });
        return;
      }
      if (input.mode === 'repo') {
        const show = await loadShowcase(input.target);
        if (get().controller !== controller) return;
        if (show) {
          set({ analysis: show, idx: buildIndexes(show), status: 'done', source: 'showcase', savedAt: show.createdAt, progress: { fraction: 1, label: 'Showcase' } });
          return;
        }
      }
    }

    // 2. live analysis, streaming into the store
    clearContents();
    startT.t = performance.now();
    set({ status: 'running', source: 'live', savedAt: null });
    const log = (level: LogLevel, text: string) => {
      if (get().controller !== controller) return;
      set((s) => ({ log: [...s.log, { t: performance.now() - startT.t, level, text }] }));
    };
    try {
      const result = await runAnalysis(input, () => createWorkerPool(), {
        signal: controller.signal,
        log,
        update: (a) => {
          if (get().controller === controller) set({ analysis: a, idx: buildIndexes(a) });
        },
        progress: (fraction, label) => {
          if (get().controller === controller) set({ progress: { fraction, label } });
        },
      });
      if (get().controller !== controller) return;
      set({ analysis: result, idx: buildIndexes(result), status: 'done', savedAt: new Date().toISOString() });
      void saveAnalysis(input.mode, input.target, result);
    } catch (err) {
      if ((err as Error).name === 'AbortError' || get().controller !== controller) return;
      const message = (err as Error).message ?? String(err);
      log('error', message);
      set({ status: 'error', error: message, rateLimited: Boolean((err as { rateLimited?: boolean }).rateLimited) });
    }
  },

  cancel() {
    get().controller?.abort();
    set({ status: get().analysis ? 'done' : 'idle', controller: null });
  },

  select(id) {
    set({ selectedId: id });
  },

  toggleFocus(on) {
    set((s) => ({ focusMode: on ?? !s.focusMode }));
  },

  reset() {
    get().controller?.abort();
    set({ input: null, status: 'idle', analysis: null, idx: buildIndexes(null), log: [], error: null, selectedId: null, controller: null });
  },
}));

/** ids of the selected node and its direct neighbours (for focus mode / blast radius) */
export function neighbourhood(idx: Indexes, id: string | null): Set<string> | null {
  if (!id) return null;
  const set = new Set<string>([id]);
  for (const e of idx.out.get(id) ?? []) set.add(e.target);
  for (const e of idx.in.get(id) ?? []) set.add(e.source);
  return set;
}
