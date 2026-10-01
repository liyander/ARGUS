import type { RepoInfo, TreeEntry } from '../core/model';

/**
 * GitHub access. Budget: 2 REST API calls per repo (metadata + recursive tree);
 * file contents come from raw.githubusercontent.com (no API quota).
 *
 * Source chain, so the 60/hour unauthenticated limit doesn't block scans:
 *   1. the user's own token (if set)          -> api.github.com directly
 *   2. the Stackscope GitHub proxy (/api/gh)   -> deployer's token, server-side + cached
 *   3. api.github.com unauthenticated
 *   4. no-API fallback: ungh.cc (metadata) + jsDelivr (file list), repos up to 50 MB
 * Files: raw.githubusercontent.com, falling back to the jsDelivr CDN when throttled.
 */

let token: string | null = null;

/** Personal access token, kept in memory only (the UI mirrors it to sessionStorage). */
export function setGithubToken(t: string | null) {
  token = t && t.trim() ? t.trim() : null;
}
export function hasGithubToken() {
  return token !== null;
}

export interface RepoRef {
  owner: string;
  repo: string;
  ref: string | null;
  subPath: string;
}

export class GithubError extends Error {
  constructor(message: string, public status: number, public rateLimited = false) {
    super(message);
  }
}

const RESERVED = new Set(['orgs', 'settings', 'marketplace', 'explore', 'topics', 'sponsors', 'login']);

/** Accepts owner/repo, github.com/owner/repo, and /tree/<branch>/<folder> URLs. */
export function parseRepoInput(raw: string): RepoRef | null {
  let s = raw.trim();
  if (!s) return null;
  s = s.replace(/^git\+/, '').replace(/^git@github\.com:/, 'github.com/');
  s = s.replace(/^https?:\/\//, '').replace(/^www\./, '');
  if (s.startsWith('github.com/')) s = s.slice('github.com/'.length);
  else if (/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(s) && !/^[\w.-]+\/[\w.-]+$/.test(s)) return null; // another domain
  s = s.split(/[?#]/)[0].replace(/\/+$/, '');
  const parts = s.split('/');
  if (parts.length < 2) return null;
  const [owner, repoRaw, kind, ref, ...rest] = parts;
  const repo = repoRaw.replace(/\.git$/, '');
  if (!/^[\w.-]+$/.test(owner) || !/^[\w.-]+$/.test(repo) || RESERVED.has(owner)) return null;
  if ((kind === 'tree' || kind === 'blob') && ref) {
    return { owner, repo, ref, subPath: rest.join('/') };
  }
  return { owner, repo, ref: null, subPath: '' };
}

export function looksLikeRepo(raw: string): boolean {
  const s = raw.trim();
  if (/github\.com\//i.test(s)) return parseRepoInput(s) !== null;
  return /^[\w.-]+\/[\w.-]+$/.test(s) && !/^[\w-]+\.[a-z]{2,}\//i.test(s);
}

/** Same-origin GitHub proxy (edge function). Browser only; Node scripts use their own token. */
const GH_PROXY: string | null =
  typeof location === 'undefined'
    ? null
    : (import.meta.env?.VITE_GH_PROXY_URL as string | undefined) ??
      String(import.meta.env?.VITE_EDGE_URL ?? '/api/fetch').replace(/\/api\/fetch$/, '/api/gh');

/** Sources found unavailable this session are skipped, so we don't pay for them twice. */
const down = { proxy: false, direct: false, raw: false };

/** Which source answered the last API call — shown in the scan log. */
export let lastApiSource: 'token' | 'proxy' | 'direct' | 'fallback' | 'minimal' = 'direct';
let lastRateLimit: GithubError | null = null;

function rateLimitError(res: Response): GithubError {
  const reset = Number(res.headers.get('x-ratelimit-reset')) * 1000;
  const mins = reset ? Math.max(1, Math.ceil((reset - Date.now()) / 60000)) : 60;
  return new GithubError(`GitHub API rate limit reached. Resets in ~${mins} min — or add a personal access token.`, res.status, true);
}

function isRateLimited(res: Response) {
  return res.status === 429 || (res.status === 403 && res.headers.get('x-ratelimit-remaining') === '0');
}

function failFor(res: Response): GithubError {
  if (res.status === 404) return new GithubError('Repository not found (or it is private).', 404);
  if (res.status === 401) return new GithubError('GitHub rejected the access token.', 401);
  return new GithubError(`GitHub API error ${res.status}`, res.status);
}

/** GET a GitHub REST path through the source chain. Returns null when every API route is rate-limited. */
async function api<T>(path: string, signal?: AbortSignal): Promise<T | null> {
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json' };
  // 1. the user's own token
  if (token) {
    const res = await fetch(`https://api.github.com${path}`, { headers: { ...headers, Authorization: `Bearer ${token}` }, signal });
    if (res.ok) {
      lastApiSource = 'token';
      return res.json() as Promise<T>;
    }
    if (!isRateLimited(res)) throw failFor(res);
  }
  // 2. the Stackscope proxy (server-side token + cache)
  if (GH_PROXY && !down.proxy) {
    try {
      const res = await fetch(`${GH_PROXY}${path}`, { signal });
      const json = /json/.test(res.headers.get('content-type') ?? '');
      if (res.ok && json) {
        lastApiSource = 'proxy';
        return res.json() as Promise<T>;
      }
      if (json && (res.status === 404 || res.status === 401)) throw failFor(res);
      down.proxy = true; // not deployed / not configured / rate-limited: stop asking this session
    } catch (err) {
      if (err instanceof GithubError || (err as Error).name === 'AbortError') throw err;
      down.proxy = true;
    }
  }
  // 3. unauthenticated
  if (!down.direct) {
    const res = await fetch(`https://api.github.com${path}`, { headers, signal });
    if (res.ok) {
      lastApiSource = 'direct';
      return res.json() as Promise<T>;
    }
    if (!isRateLimited(res)) throw failFor(res);
    down.direct = true;
    lastRateLimit = rateLimitError(res);
  }
  return null; // caller uses the no-API fallback
}

interface GhRepo {
  name: string;
  full_name: string;
  owner: { login: string; avatar_url: string };
  description: string | null;
  stargazers_count: number;
  forks_count: number;
  default_branch: string;
  license: { spdx_id: string; name: string } | null;
  topics?: string[];
  size: number;
  pushed_at: string | null;
  homepage: string | null;
  language: string | null;
  private: boolean;
}

export async function fetchRepoInfo(ref: RepoRef, signal?: AbortSignal): Promise<RepoInfo> {
  const r = await api<GhRepo>(`/repos/${ref.owner}/${ref.repo}`, signal);
  if (r) {
    return {
      owner: r.owner.login,
      name: r.name,
      fullName: r.full_name,
      description: r.description,
      stars: r.stargazers_count,
      forks: r.forks_count,
      defaultBranch: r.default_branch,
      ref: ref.ref ?? r.default_branch,
      subPath: ref.subPath,
      license: r.license && r.license.spdx_id !== 'NOASSERTION' ? r.license.spdx_id : r.license?.name ?? null,
      topics: r.topics ?? [],
      sizeKb: r.size,
      pushedAt: r.pushed_at,
      avatarUrl: r.owner.avatar_url,
      homepage: r.homepage || null,
      language: r.language,
    };
  }
  // 4. no-API fallback: ungh.cc, a cached public GitHub metadata mirror (UnJS)
  const res = await fetch(`https://ungh.cc/repos/${ref.owner}/${ref.repo}`, { signal }).catch(() => null);
  if (res?.status === 404) throw new GithubError('Repository not found (or it is private).', 404);
  if (!res?.ok) return minimalRepoInfo(ref, signal); // the mirror is busy too: last resort needs no API at all
  const { repo: u } = (await res.json()) as {
    repo: { name: string; repo: string; description: string | null; stars: number; forks: number; defaultBranch: string; pushedAt: string | null };
  };
  lastApiSource = 'fallback';
  const owner = u.repo.split('/')[0];
  return {
    owner,
    name: u.name,
    fullName: u.repo,
    description: u.description,
    stars: u.stars,
    forks: u.forks,
    defaultBranch: u.defaultBranch,
    ref: ref.ref ?? u.defaultBranch,
    subPath: ref.subPath,
    license: null,
    topics: [],
    sizeKb: 0,
    pushedAt: u.pushedAt,
    avatarUrl: `https://github.com/${owner}.png?size=80`,
    homepage: null,
    language: null,
  };
}

/** jsDelivr listings already fetched while probing for the default branch (reused by fetchTree). */
const jsdelivrListings = new Map<string, { files: { name: string; size: number }[] } | 'too-big'>();

async function jsdelivrListing(owner: string, repo: string, branch: string, signal?: AbortSignal) {
  const key = `${owner}/${repo}@${branch}`;
  if (jsdelivrListings.has(key)) return jsdelivrListings.get(key)!;
  const res = await fetch(`https://data.jsdelivr.com/v1/packages/gh/${owner}/${repo}@${encodeURIComponent(branch)}?structure=flat`, { signal }).catch(() => null);
  const body = res ? ((await res.json().catch(() => null)) as { files?: { name: string; size: number }[]; message?: string } | null) : null;
  if (res?.ok && body?.files) {
    jsdelivrListings.set(key, { files: body.files });
    return jsdelivrListings.get(key)!;
  }
  if (/size exceeded/i.test(body?.message ?? '')) {
    jsdelivrListings.set(key, 'too-big');
    return 'too-big' as const;
  }
  return null;
}

/** No API, no mirror: find the default branch via jsDelivr and report what we can. */
async function minimalRepoInfo(ref: RepoRef, signal?: AbortSignal): Promise<RepoInfo> {
  let branch: string | null = ref.ref;
  if (!branch) {
    for (const b of ['main', 'master', 'develop', 'canary', 'trunk']) {
      if (await jsdelivrListing(ref.owner, ref.repo, b, signal)) {
        branch = b;
        break;
      }
    }
  }
  if (!branch) throw lastRateLimit ?? new GithubError('Repository not found (or it is private).', 404);
  lastApiSource = 'minimal';
  return {
    owner: ref.owner,
    name: ref.repo,
    fullName: `${ref.owner}/${ref.repo}`,
    description: null,
    stars: -1, // unknown
    forks: 0,
    defaultBranch: branch,
    ref: branch,
    subPath: ref.subPath,
    license: null,
    topics: [],
    sizeKb: 0,
    pushedAt: null,
    avatarUrl: `https://github.com/${ref.owner}.png?size=80`,
    homepage: null,
    language: null,
  };
}

interface GhTree {
  sha: string;
  truncated: boolean;
  tree: { path: string; type: 'blob' | 'tree' | 'commit'; size?: number }[];
}

export async function fetchTree(
  owner: string,
  repo: string,
  ref: string,
  signal?: AbortSignal,
): Promise<{ sha: string; truncated: boolean; files: TreeEntry[] }> {
  const t = await api<GhTree>(`/repos/${owner}/${repo}/git/trees/${encodeURI(ref)}?recursive=1`, signal);
  if (t) {
    return {
      sha: t.sha,
      truncated: t.truncated,
      files: t.tree.filter((e) => e.type === 'blob').map((e) => ({ path: e.path, size: e.size ?? 0 })),
    };
  }
  // 4. no-API fallback: jsDelivr's flat file listing (repos up to 50 MB)
  const [branch, sub] = ref.split(':');
  const body = await jsdelivrListing(owner, repo, branch, signal);
  const viaListing = lastApiSource === 'minimal' ? 'minimal' : 'fallback';
  if (!body || body === 'too-big') {
    throw new GithubError(
      body === 'too-big'
        ? 'GitHub API rate limit reached, and this repo is too large (>50 MB) for the no-API fallback. Add a GitHub token, or deploy the /api/gh proxy with a server token.'
        : (lastRateLimit?.message ?? 'Could not list repository files.'),
      429,
      true,
    );
  }
  const prefix = sub ? `/${sub.replace(/\/$/, '')}/` : '/';
  lastApiSource = viaListing;
  return {
    sha: branch, // a branch name works for raw/jsDelivr file URLs
    truncated: false,
    files: body.files.filter((f) => f.name.startsWith(prefix)).map((f) => ({ path: f.name.slice(prefix.length), size: f.size })),
  };
}

const encodePath = (path: string) => path.split('/').map(encodeURIComponent).join('/');

export function rawUrl(owner: string, repo: string, sha: string, path: string) {
  return `https://raw.githubusercontent.com/${owner}/${repo}/${sha}/${encodePath(path)}`;
}

function cdnUrl(owner: string, repo: string, sha: string, path: string) {
  return `https://cdn.jsdelivr.net/gh/${owner}/${repo}@${sha}/${encodePath(path)}`;
}

export function blobUrl(owner: string, repo: string, ref: string, path: string, line?: number) {
  return `https://github.com/${owner}/${repo}/blob/${ref}/${path}${line ? `#L${line}` : ''}`;
}

/**
 * Download a file. raw.githubusercontent.com first; once it throttles (429) the rest
 * of the session uses the jsDelivr CDN, which mirrors public GitHub repos.
 */
export async function fetchRaw(owner: string, repo: string, sha: string, path: string, signal?: AbortSignal): Promise<string | null> {
  const sources = down.raw ? [cdnUrl, rawUrl] : [rawUrl, cdnUrl];
  for (let pass = 0; pass < 2; pass++) {
    for (const url of sources) {
      try {
        const res = await fetch(url(owner, repo, sha, path), { signal });
        if (res.ok) return await res.text();
        if (res.status === 404) return null;
        if (res.status === 429 || res.status === 403) {
          rawThrottled++;
          if (url === rawUrl) down.raw = true;
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') throw err;
      }
    }
    await new Promise((r) => setTimeout(r, 1200));
  }
  rawFailed++;
  return null;
}

/** Download health counters, so the pipeline can warn instead of silently showing "0 files". */
let rawThrottled = 0;
let rawFailed = 0;
export function rawStats() {
  return { throttled: rawThrottled, failed: rawFailed };
}
export function resetRawStats() {
  rawThrottled = 0;
  rawFailed = 0;
}
