import { createStore, del, get, set } from 'idb-keyval';
import type { Analysis } from './model';

/**
 * IndexedDB cache: reopen past analyses instantly (and offline). Each entry
 * remembers the commit SHA it was computed from; the UI offers a re-scan.
 */
const store = typeof indexedDB !== 'undefined' ? createStore('stackscope', 'analyses') : null;
const RECENT_KEY = 'recent';
const MAX_RECENT = 24;

export interface RecentEntry {
  key: string;
  mode: Analysis['mode'];
  target: string;
  label: string;
  savedAt: string;
  score: number;
  grade: string;
  stack: string[];
  sha?: string;
}

export const cacheKey = (mode: string, target: string) => `analysis:${mode}:${target.toLowerCase()}`;

export async function saveAnalysis(mode: Analysis['mode'], target: string, analysis: Analysis) {
  if (!store) return;
  const key = cacheKey(mode, target);
  try {
    await set(key, { savedAt: new Date().toISOString(), analysis }, store);
    const recent = ((await get<RecentEntry[]>(RECENT_KEY, store)) ?? []).filter((r) => r.key !== key);
    recent.unshift({
      key,
      mode,
      target,
      label: analysis.context.repo?.fullName ?? analysis.context.url?.finalUrl.replace(/^https?:\/\//, '').replace(/\/$/, '') ?? target,
      savedAt: new Date().toISOString(),
      score: analysis.summary.health.score,
      grade: analysis.summary.health.grade,
      stack: analysis.summary.stack.slice(0, 5),
      sha: analysis.context.sha,
    });
    for (const old of recent.splice(MAX_RECENT)) await del(old.key, store);
    await set(RECENT_KEY, recent, store);
  } catch {
    /* quota or private mode: caching is best-effort */
  }
}

export async function loadAnalysis(mode: string, target: string): Promise<{ savedAt: string; analysis: Analysis } | null> {
  if (!store) return null;
  try {
    return (await get(cacheKey(mode, target), store)) ?? null;
  } catch {
    return null;
  }
}

export async function listRecent(): Promise<RecentEntry[]> {
  if (!store) return [];
  try {
    return (await get<RecentEntry[]>(RECENT_KEY, store)) ?? [];
  } catch {
    return [];
  }
}

export async function forgetRecent(key: string) {
  if (!store) return;
  const recent = ((await get<RecentEntry[]>(RECENT_KEY, store)) ?? []).filter((r) => r.key !== key);
  await set(RECENT_KEY, recent, store);
  await del(key, store);
}
