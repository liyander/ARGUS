import { runRepoPipeline } from '../analyzers/repo';
import { runUrlPipeline } from '../analyzers/url';
import { looksLikeRepo, parseRepoInput } from '../sources/github';
import { normalizeUrlInput } from '../sources/edge';
import type { Analysis, PipelineCallbacks } from './model';
import type { ParseBackend } from './parsers';

export interface AnalysisInput {
  mode: 'repo' | 'url';
  /** repo: owner/repo[/tree/ref/sub] — url: absolute URL */
  target: string;
}

/** Decide between repo mode and URL mode from free-form input. */
export function detectInput(raw: string): AnalysisInput | null {
  const s = raw.trim();
  if (!s) return null;
  if (looksLikeRepo(s)) {
    const ref = parseRepoInput(s);
    if (ref) return { mode: 'repo', target: repoTarget(ref.owner, ref.repo, ref.ref, ref.subPath) };
  }
  const url = normalizeUrlInput(s);
  return url ? { mode: 'url', target: url } : null;
}

export function repoTarget(owner: string, repo: string, ref?: string | null, subPath?: string) {
  return `${owner}/${repo}${ref ? `/tree/${ref}${subPath ? `/${subPath}` : ''}` : ''}`;
}

/** Path inside the app for an input — shareable links like /r/vercel/next.js */
export function routeFor(input: AnalysisInput): string {
  if (input.mode === 'repo') return `/r/${input.target}`;
  return `/u/${encodeURIComponent(input.target.replace(/^https:\/\//, '').replace(/\/$/, ''))}`;
}

export async function runAnalysis(input: AnalysisInput, backend: () => ParseBackend, cb: PipelineCallbacks): Promise<Analysis> {
  if (input.mode === 'url') return runUrlPipeline(input.target, cb);
  const b = backend();
  try {
    return await runRepoPipeline(input.target, { backend: b }, cb);
  } finally {
    b.dispose?.();
  }
}
