/**
 * GET /api/gh/repos/{owner}/{repo}[/git/trees/{ref}?recursive=1]
 *
 * Read-only GitHub REST proxy authenticated with the deployer's own token
 * (GITHUB_TOKEN secret), so visitors share 5,000 req/hour instead of each
 * hitting the 60/hour anonymous limit. Responses are cached at the edge:
 * trees addressed by commit SHA are immutable (24 h); everything else 10 min.
 *
 * Deliberately narrow: only the two endpoints Stackscope needs, public data only,
 * per-visitor rate limit. The token never leaves the server.
 */

export interface GithubProxyOptions {
  token?: string;
  allowedOrigins?: string;
  devMode?: boolean;
}

const ROUTE = /^\/repos\/([\w.-]+)\/([\w.-]+)(\/git\/trees\/([^?#]+))?$/;
const LIMIT = 120; // calls…
const WINDOW_MS = 10 * 60 * 1000; // …per 10 minutes per visitor (a scan uses 2)
const hits = new Map<string, number[]>();

function limited(ip: string) {
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > LIMIT;
}

export async function handleGithub(request: Request, opts: GithubProxyOptions = {}): Promise<Response> {
  const origin = request.headers.get('origin') ?? '';
  const allowed = (opts.allowedOrigins ?? '*').split(',').map((s) => s.trim());
  const cors: Record<string, string> = {
    'Access-Control-Allow-Origin': allowed.includes('*') ? '*' : allowed.includes(origin) ? origin : allowed[0],
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Expose-Headers': 'X-Stackscope-Cache',
    Vary: 'Origin',
  };
  const json = (body: unknown, status: number, extra: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...cors, ...extra } });

  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
  if (!opts.token) return json({ error: 'GitHub proxy not configured (set the GITHUB_TOKEN secret).' }, 501);

  const url = new URL(request.url);
  const path = url.pathname.replace(/^.*?\/api\/gh/, '');
  const m = path.match(ROUTE);
  if (!m) return json({ error: 'Only /repos/{owner}/{repo} and /repos/{owner}/{repo}/git/trees/{ref} are proxied.' }, 400);
  const treeRef = m[4] ? decodeURIComponent(m[4]) : null;
  const upstream = `https://api.github.com/repos/${m[1]}/${m[2]}${treeRef ? `/git/trees/${encodeURI(treeRef)}?recursive=1` : ''}`;

  const cached = await cacheGet(path);
  if (cached) return new Response(cached, { status: 200, headers: { 'Content-Type': 'application/json', ...cors, 'X-Stackscope-Cache': 'HIT' } });

  const ip = request.headers.get('cf-connecting-ip') ?? request.headers.get('x-forwarded-for')?.split(',')[0] ?? 'unknown';
  if (!opts.devMode && limited(ip)) return json({ error: 'Too many requests to the GitHub proxy. Try again in a few minutes.' }, 429, { 'Retry-After': '600' });

  const gh = (u: string) =>
    fetch(u, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${opts.token}`,
        'User-Agent': 'stackscope-proxy',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

  // Public repos only: a token that can see private repos must not expose them to visitors.
  if (treeRef) {
    const metaPath = `/repos/${m[1]}/${m[2]}`;
    let meta = await cacheGet(metaPath);
    if (!meta) {
      const r = await gh(`https://api.github.com${metaPath}`);
      if (!r.ok) return new Response(await r.text(), { status: r.status, headers: { 'Content-Type': 'application/json', ...cors } });
      meta = await r.text();
      if (!(JSON.parse(meta) as { private?: boolean }).private) await cachePut(metaPath, meta, 600);
    }
    if ((JSON.parse(meta) as { private?: boolean }).private) return json({ message: 'Not Found' }, 404);
  }

  const res = await gh(upstream);
  const body = await res.text();
  if (!res.ok) {
    // pass rate-limit state through so the client can fall back
    const extra: Record<string, string> = {};
    for (const h of ['x-ratelimit-remaining', 'x-ratelimit-reset']) {
      const v = res.headers.get(h);
      if (v) extra[h] = v;
    }
    // never cache errors; never forward private-repo existence beyond GitHub's own 404
    return new Response(body, { status: res.status, headers: { 'Content-Type': 'application/json', ...cors, ...extra } });
  }
  // a private repo visible to the deployer's token must not leak to anonymous visitors
  if (!treeRef && (JSON.parse(body) as { private?: boolean }).private) return json({ message: 'Not Found' }, 404);

  const immutable = treeRef && /^[0-9a-f]{40}$/.test(treeRef);
  const maxAge = immutable ? 86400 : 600;
  await cachePut(path, body, maxAge);
  return new Response(body, { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${maxAge}`, ...cors, 'X-Stackscope-Cache': 'MISS' } });
}

// ── cache: Cloudflare Cache API in production, a small in-memory map elsewhere (dev) ──
const memory = new Map<string, { body: string; expires: number }>();

async function cacheGet(path: string): Promise<string | null> {
  const cache = (globalThis as unknown as { caches?: { default?: Cache } }).caches?.default;
  if (cache) {
    const hit = await cache.match(new Request(`https://stackscope-gh.internal${path}`));
    return hit ? hit.text() : null;
  }
  const m = memory.get(path);
  if (m && m.expires > Date.now()) return m.body;
  memory.delete(path);
  return null;
}

async function cachePut(path: string, body: string, maxAge: number) {
  const cache = (globalThis as unknown as { caches?: { default?: Cache } }).caches?.default;
  if (cache) {
    await cache
      .put(new Request(`https://stackscope-gh.internal${path}`), new Response(body, { headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${maxAge}` } }))
      .catch(() => {});
    return;
  }
  if (memory.size > 500) memory.clear();
  memory.set(path, { body, expires: Date.now() + maxAge * 1000 });
}
