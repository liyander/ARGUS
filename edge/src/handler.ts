/**
 * Stackscope edge fetch — the only server-side code in the project.
 *
 * GET /api/fetch?url=https://example.com
 *   → { finalUrl, status, redirects, headers, html, scripts[], extras{robots, sitemap, securityTxt, manifest} }
 *
 * Passive only: it fetches what any visitor's browser would fetch (the page, its
 * same-site scripts, and the well-known public files). All analysis runs in the
 * browser. Guards: http(s) only, default ports only, private/internal IPs blocked
 * (checked on every redirect hop, after DNS resolution), 5 MB / 10 s caps,
 * per-visitor rate limit, 1 hour response cache.
 */

export interface HandlerOptions {
  devMode?: boolean;
  /** comma-separated list of allowed CORS origins; '*' when unset */
  allowedOrigins?: string;
}

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_SCRIPT_BYTES = 1_500_000;
const TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 5;
const MAX_SCRIPTS = 6;
const RATE_LIMIT = 20; // analyses…
const RATE_WINDOW_MS = 10 * 60 * 1000; // …per 10 minutes per visitor
const CACHE_TTL_S = 3600;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36 Stackscope/1.0 (+https://stackscope.dev/about)';

// ── SSRF protection ─────────────────────────────────────────────────────────

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p) || Number(p) > 255) return null;
    n = n * 256 + Number(p);
  }
  return n;
}

const PRIVATE_V4: [string, number][] = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24],
  ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
];

export function isPrivateIp(ip: string): boolean {
  const v4 = ipv4ToInt(ip);
  if (v4 !== null) {
    return PRIVATE_V4.some(([base, bits]) => {
      const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
      return ((v4 & mask) >>> 0) === ((ipv4ToInt(base)! & mask) >>> 0);
    });
  }
  const v6 = ip.toLowerCase().replace(/^\[|\]$/g, '');
  if (v6 === '::' || v6 === '::1') return true;
  if (/^f[cd]/.test(v6) || /^fe[89ab]/.test(v6) || /^ff/.test(v6)) return true; // ULA, link-local, multicast
  const mapped = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIp(mapped[1]);
  if (/^(64:ff9b|2001:db8|2002:)/.test(v6)) return true;
  return false;
}

async function resolveHost(host: string): Promise<string[]> {
  const out: string[] = [];
  for (const type of ['A', 'AAAA']) {
    try {
      const res = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(host)}&type=${type}`, {
        headers: { Accept: 'application/dns-json' },
      });
      const json = (await res.json()) as { Answer?: { type: number; data: string }[] };
      for (const a of json.Answer ?? []) if (a.type === 1 || a.type === 28) out.push(a.data);
    } catch {
      /* treat as unresolved */
    }
  }
  return out;
}

export class BlockedError extends Error {}

export async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new BlockedError('Invalid URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new BlockedError('Only http(s) URLs are allowed');
  if (url.port && url.port !== '80' && url.port !== '443') throw new BlockedError('Only default ports (80/443) are allowed');
  if (url.username || url.password) throw new BlockedError('Credentials in URLs are not allowed');
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  if (!host.includes('.') || /(^|\.)(localhost|local|internal|intranet|lan|home|corp|localdomain)$/.test(host)) {
    throw new BlockedError('Internal hostnames are not allowed');
  }
  const literal = ipv4ToInt(host) !== null || host.startsWith('[');
  if (literal) {
    if (isPrivateIp(host)) throw new BlockedError('Private IP ranges are not allowed');
    return url;
  }
  const ips = await resolveHost(host);
  if (ips.length === 0) throw new BlockedError(`Could not resolve ${host}`);
  if (ips.some(isPrivateIp)) throw new BlockedError('Host resolves to a private IP range');
  return url;
}

// ── Fetching with caps ──────────────────────────────────────────────────────

interface FetchResult {
  url: string;
  status: number;
  headers: Record<string, string>;
  body: string;
  truncated: boolean;
  redirects: { url: string; status: number }[];
}

async function readCapped(res: Response, cap: number): Promise<{ text: string; truncated: boolean }> {
  if (!res.body) return { text: '', truncated: false };
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let truncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (size + value.byteLength > cap) {
      chunks.push(value.slice(0, cap - size));
      truncated = true;
      await reader.cancel();
      break;
    }
    chunks.push(value);
    size += value.byteLength;
  }
  const all = new Uint8Array(chunks.reduce((s, c) => s + c.byteLength, 0));
  let o = 0;
  for (const c of chunks) {
    all.set(c, o);
    o += c.byteLength;
  }
  return { text: new TextDecoder('utf-8', { fatal: false }).decode(all), truncated };
}

async function safeFetch(raw: string, opts: { cap?: number; method?: string; accept?: string } = {}): Promise<FetchResult> {
  const redirects: { url: string; status: number }[] = [];
  let current = raw;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const url = await assertPublicUrl(current);
      const res = await fetch(url.toString(), {
        method: opts.method ?? 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'User-Agent': UA,
          Accept: opts.accept ?? 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
        redirects.push({ url: url.toString(), status: res.status });
        current = new URL(res.headers.get('location')!, url).toString();
        await res.body?.cancel();
        continue;
      }
      const headers: Record<string, string> = {};
      res.headers.forEach((v, k) => {
        headers[k] = headers[k] ? `${headers[k]}, ${v}` : v;
      });
      const { text, truncated } = opts.method === 'HEAD' ? { text: '', truncated: false } : await readCapped(res, opts.cap ?? MAX_BYTES);
      return { url: url.toString(), status: res.status, headers, body: text, truncated, redirects };
    }
    throw new BlockedError('Too many redirects');
  } finally {
    clearTimeout(timer);
  }
}

async function tryFetch(raw: string, cap: number, accept?: string): Promise<FetchResult | null> {
  try {
    const r = await safeFetch(raw, { cap, accept });
    return r.status >= 200 && r.status < 300 ? r : null;
  } catch {
    return null;
  }
}

/** Same registrable-ish site: compare the last two labels (three for co.uk-style). */
function siteOf(host: string): string {
  const parts = host.split('.');
  const n = /^(co|com|org|net|gov|ac|edu)$/.test(parts[parts.length - 2] ?? '') && parts.length > 2 ? 3 : 2;
  return parts.slice(-n).join('.');
}

function scriptSrcs(html: string, base: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi)) {
    try {
      out.push(new URL(m[1], base).toString());
    } catch {
      /* ignore bad src */
    }
  }
  // modulepreload links are first-party bundles too
  for (const m of html.matchAll(/<link\b[^>]*rel\s*=\s*["']modulepreload["'][^>]*href\s*=\s*["']([^"']+)["']/gi)) {
    try {
      out.push(new URL(m[1], base).toString());
    } catch {
      /* ignore */
    }
  }
  return [...new Set(out)];
}

// ── Rate limit (per isolate; good enough to stop casual abuse) ──────────────

const hits = new Map<string, number[]>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();
  return list.length > RATE_LIMIT;
}

// ── Handler ────────────────────────────────────────────────────────────────

function json(body: unknown, status: number, cors: Record<string, string>, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors, ...extra },
  });
}

export async function handle(request: Request, opts: HandlerOptions = {}): Promise<Response> {
  const origin = request.headers.get('origin') ?? '';
  const allowed = (opts.allowedOrigins ?? '*').split(',').map((s) => s.trim());
  const cors: Record<string, string> = {
    'Access-Control-Allow-Origin': allowed.includes('*') ? '*' : allowed.includes(origin) ? origin : allowed[0],
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405, cors);

  const reqUrl = new URL(request.url);
  let target = reqUrl.searchParams.get('url')?.trim() ?? '';
  if (!target) return json({ error: 'Missing ?url=' }, 400, cors);
  if (!/^https?:\/\//i.test(target)) target = `https://${target}`;

  // response cache (Cloudflare Cache API when available)
  const cacheKey = new Request(`https://stackscope-cache.internal/fetch?url=${encodeURIComponent(target)}`);
  const cache = (globalThis as unknown as { caches?: { default?: Cache } }).caches?.default;
  if (cache) {
    const hit = await cache.match(cacheKey);
    if (hit) {
      const body = await hit.text();
      return new Response(body, { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors, 'X-Stackscope-Cache': 'HIT' } });
    }
  }

  const ip = request.headers.get('cf-connecting-ip') ?? request.headers.get('x-forwarded-for')?.split(',')[0] ?? 'unknown';
  if (!opts.devMode && rateLimited(ip)) {
    return json({ error: 'Rate limit: 20 URL analyses per 10 minutes. Try again shortly.' }, 429, cors, { 'Retry-After': '600' });
  }

  const started = Date.now();
  let page: FetchResult;
  try {
    page = await safeFetch(target);
  } catch (err) {
    const blocked = err instanceof BlockedError;
    const msg = blocked ? (err as Error).message : (err as Error).name === 'AbortError' ? 'Timed out after 10 seconds' : `Fetch failed: ${(err as Error).message}`;
    return json({ error: msg }, blocked ? 400 : 502, cors);
  }

  const finalUrl = new URL(page.url);
  const origin0 = finalUrl.origin;
  const site = siteOf(finalUrl.hostname);
  const isHtml = /html|xml/.test(page.headers['content-type'] ?? 'text/html');

  // first-party scripts (what every visitor downloads anyway)
  const srcs = isHtml ? scriptSrcs(page.body, page.url) : [];
  // same site, or the brand's asset domain (github.com → githubassets.com)
  const brand = site.split('.')[0];
  const firstParty = srcs.filter((s) => {
    try {
      const other = siteOf(new URL(s).hostname);
      return other === site || (brand.length >= 4 && other.split('.')[0].startsWith(brand));
    } catch {
      return false;
    }
  });
  const manifestHref = page.body.match(/<link\b[^>]*rel\s*=\s*["']manifest["'][^>]*href\s*=\s*["']([^"']+)["']/i)?.[1];

  const [scripts, robots, sitemap, securityTxt, manifest] = await Promise.all([
    Promise.all(
      firstParty.slice(0, MAX_SCRIPTS).map(async (src) => {
        const r = await tryFetch(src, MAX_SCRIPT_BYTES, '*/*');
        if (!r) return { url: src, ok: false, size: 0, content: '', sourceMap: null as string | null, sourceMapPublic: false };
        const mapRef = r.body.slice(-600).match(/\/\/[#@]\s*sourceMappingURL=(\S+)\s*$/)?.[1] ?? r.headers['sourcemap'] ?? r.headers['x-sourcemap'] ?? null;
        let sourceMap: string | null = null;
        let sourceMapPublic = false;
        if (mapRef && !mapRef.startsWith('data:')) {
          sourceMap = new URL(mapRef, src).toString();
          try {
            const head = await safeFetch(sourceMap, { method: 'HEAD', accept: '*/*' });
            sourceMapPublic = head.status === 200;
          } catch {
            /* unreachable */
          }
        }
        return { url: src, ok: true, size: r.body.length, content: r.body.slice(0, 800_000), sourceMap, sourceMapPublic };
      }),
    ),
    tryFetch(`${origin0}/robots.txt`, 100_000, 'text/plain'),
    tryFetch(`${origin0}/sitemap.xml`, 500_000, 'application/xml'),
    tryFetch(`${origin0}/.well-known/security.txt`, 50_000, 'text/plain'),
    tryFetch(manifestHref ? new URL(manifestHref, page.url).toString() : `${origin0}/manifest.json`, 100_000, 'application/json'),
  ]);

  const looksText = (r: FetchResult | null) => (r && !/text\/html/.test(r.headers['content-type'] ?? '') ? r.body : null);
  const sitemapUrls = sitemap && /<(urlset|sitemapindex)/.test(sitemap.body) ? [...sitemap.body.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]) : [];

  const body = {
    input: target,
    finalUrl: page.url,
    status: page.status,
    redirects: page.redirects,
    headers: page.headers,
    html: page.body.slice(0, 2_000_000),
    htmlTruncated: page.truncated || page.body.length > 2_000_000,
    tls: { https: finalUrl.protocol === 'https:', hsts: Boolean(page.headers['strict-transport-security']) },
    scripts,
    allScripts: srcs,
    extras: {
      robots: looksText(robots)?.slice(0, 20_000) ?? null,
      sitemap: sitemapUrls.length ? { count: sitemapUrls.length, sample: sitemapUrls.slice(0, 60) } : null,
      securityTxt: looksText(securityTxt)?.slice(0, 5_000) ?? null,
      manifest: manifest && /json/.test(manifest.headers['content-type'] ?? '') ? manifest.body.slice(0, 20_000) : null,
    },
    fetchedAt: new Date().toISOString(),
    durationMs: Date.now() - started,
  };
  const payload = JSON.stringify(body);
  if (cache) {
    await cache.put(cacheKey, new Response(payload, { headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${CACHE_TTL_S}` } })).catch(() => {});
  }
  return new Response(payload, { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', ...cors, 'X-Stackscope-Cache': 'MISS' } });
}

export type EdgeFetchResponse = {
  input: string;
  finalUrl: string;
  status: number;
  redirects: { url: string; status: number }[];
  headers: Record<string, string>;
  html: string;
  htmlTruncated: boolean;
  tls: { https: boolean; hsts: boolean };
  scripts: { url: string; ok: boolean; size: number; content: string; sourceMap: string | null; sourceMapPublic: boolean }[];
  allScripts: string[];
  extras: {
    robots: string | null;
    sitemap: { count: number; sample: string[] } | null;
    securityTxt: string | null;
    manifest: string | null;
  };
  fetchedAt: string;
  durationMs: number;
};
