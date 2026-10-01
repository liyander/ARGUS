import type { Analysis } from './model';

/** Pre-computed analyses written by scripts/build-showcase.ts (served from /showcase). */
export interface ShowcaseEntry {
  target: string;
  slug: string;
  title: string;
  description: string | null;
  stars: number;
  score: number;
  grade: string;
  stack: string[];
  counts: Record<string, number>;
  language: string | null;
  analyzedAt: string;
}

let indexPromise: Promise<ShowcaseEntry[]> | null = null;

export function showcaseIndex(): Promise<ShowcaseEntry[]> {
  indexPromise ??= fetch('/showcase/index.json')
    .then((r) => (r.ok ? r.json() : []))
    .catch(() => []);
  return indexPromise;
}

export const slugFor = (target: string) => target.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export async function loadShowcase(target: string): Promise<Analysis | null> {
  const index = await showcaseIndex();
  const entry = index.find((e) => e.target.toLowerCase() === target.toLowerCase());
  if (!entry) return null;
  try {
    const res = await fetch(`/showcase/${entry.slug}.json`);
    if (!res.ok) return null;
    const a = (await res.json()) as Analysis;
    // never trust an analysis whose downloads all failed; scan live instead
    return !a.summary.counts.filesAnalyzed && a.summary.counts.sourceFiles ? null : a;
  } catch {
    return null;
  }
}
