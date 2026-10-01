import { chunk, pool } from '../../lib/util';
import type { Ecosystem } from './stack/types';

/**
 * Dependency enrichment: OSV.dev for known vulnerabilities, deps.dev for latest
 * version / publish dates / licenses. Both APIs are free and allow browser CORS.
 */

export interface DepQuery {
  key: string;
  name: string;
  ecosystem: Ecosystem;
  /** coerced concrete version, or null when the manifest only gives a range we can't pin */
  version: string | null;
}

export interface VulnInfo {
  id: string;
  aliases: string[];
  summary: string;
  severity: 'critical' | 'high' | 'moderate' | 'low' | 'unknown';
  fixed: string | null;
  url: string;
  /** the manifest range (^/~/>=) already admits the fixed version — a lockfile refresh likely resolves it */
  rangeAllowsFix?: boolean;
}

/** Does a semver-ish range like ^1.2.3, ~1.2.3 or >=1.2 admit `fixed`? */
export function rangeAdmits(spec: string, fixed: string | null): boolean {
  if (!fixed) return false;
  const declared = coerceVersion(spec);
  if (!declared) return false;
  const [dM, dm] = declared.split('.').map(Number);
  const [fM, fm] = (coerceVersion(fixed) ?? '').split('.').map(Number);
  if (/^\s*>=/.test(spec) && !/</.test(spec)) return true;
  if (spec.startsWith('^')) return dM === 0 ? fM === 0 && fm === dm : fM === dM;
  if (spec.startsWith('~')) return fM === dM && fm === dm;
  return false;
}

export interface DepEnrichment {
  vulns: VulnInfo[];
  latest?: string;
  latestPublished?: string;
  versionPublished?: string;
  licenses?: string[];
  deprecated?: boolean;
}

const OSV_ECOSYSTEM: Record<Ecosystem, string> = {
  npm: 'npm', PyPI: 'PyPI', Go: 'Go', Maven: 'Maven', 'crates.io': 'crates.io', RubyGems: 'RubyGems',
  Packagist: 'Packagist', Pub: 'Pub', Hex: 'Hex',
};
const DEPSDEV_SYSTEM: Partial<Record<Ecosystem, string>> = {
  npm: 'npm', PyPI: 'pypi', Go: 'go', Maven: 'maven', 'crates.io': 'cargo', RubyGems: 'rubygems',
};

/** '^18.2.0' → '18.2.0', '>=2.1,<3' → '2.1', 'v1.9.1' → '1.9.1'. Null for tags, URLs, workspace refs. */
export function coerceVersion(spec: string): string | null {
  if (!spec || /^(workspace:|file:|link:|git|https?:|github:|\*|latest|next|catalog:)/.test(spec)) return null;
  const m = spec.match(/(\d+)(?:\.(\d+))?(?:\.(\d+))?([-+][\w.-]+)?/);
  if (!m) return null;
  return `${m[1]}.${m[2] ?? 0}.${m[3] ?? 0}${m[4] ?? ''}`;
}

export function majorOf(version: string | null | undefined): number | null {
  const m = version?.match(/^v?(\d+)/);
  return m ? Number(m[1]) : null;
}

function severityOf(v: OsvVuln): VulnInfo['severity'] {
  const ds = (v.database_specific?.severity ?? '').toString().toLowerCase();
  if (ds === 'critical' || ds === 'high' || ds === 'low') return ds;
  if (ds === 'moderate' || ds === 'medium') return 'moderate';
  for (const s of v.severity ?? []) {
    const score = Number(s.score.match(/^(\d+(\.\d+)?)$/)?.[1]);
    if (!Number.isNaN(score)) return score >= 9 ? 'critical' : score >= 7 ? 'high' : score >= 4 ? 'moderate' : 'low';
    // CVSS vector: estimate from impact letters
    if (/\/C:H\/I:H\/A:H/.test(s.score)) return 'critical';
    if (/\/[CIA]:H/.test(s.score)) return 'high';
    if (/\/[CIA]:L/.test(s.score)) return 'moderate';
  }
  return 'unknown';
}

interface OsvVuln {
  id: string;
  summary?: string;
  details?: string;
  aliases?: string[];
  severity?: { type: string; score: string }[];
  database_specific?: { severity?: string };
  affected?: { package?: { name: string }; ranges?: { events: { fixed?: string }[] }[] }[];
}

export async function enrichDependencies(
  deps: DepQuery[],
  opts: { signal?: AbortSignal; onProgress?: (msg: string) => void; registryBudget?: number } = {},
): Promise<Map<string, DepEnrichment>> {
  const out = new Map<string, DepEnrichment>();
  for (const d of deps) out.set(d.key, { vulns: [] });

  // ── 1. OSV batch query: vuln IDs per package version
  const pinned = deps.filter((d) => d.version);
  const idsByDep = new Map<string, string[]>();
  for (const batch of chunk(pinned, 500)) {
    try {
      const res = await fetch('https://api.osv.dev/v1/querybatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          queries: batch.map((d) => ({ package: { name: d.name, ecosystem: OSV_ECOSYSTEM[d.ecosystem] }, version: d.version })),
        }),
        signal: opts.signal,
      });
      if (!res.ok) throw new Error(`OSV ${res.status}`);
      const json = (await res.json()) as { results: { vulns?: { id: string }[] }[] };
      json.results.forEach((r, i) => {
        if (r.vulns?.length) idsByDep.set(batch[i].key, r.vulns.map((v) => v.id));
      });
    } catch (err) {
      if ((err as Error).name === 'AbortError') throw err;
      opts.onProgress?.('OSV lookup failed — vulnerability data unavailable');
    }
  }

  // ── 2. vuln details (severity, fixed version), capped
  const allIds = [...new Set([...idsByDep.values()].flat())].slice(0, 80);
  const details = new Map<string, OsvVuln>();
  await pool(allIds, 8, async (id) => {
    try {
      const res = await fetch(`https://api.osv.dev/v1/vulns/${encodeURIComponent(id)}`, { signal: opts.signal });
      if (res.ok) details.set(id, await res.json());
    } catch (err) {
      if ((err as Error).name === 'AbortError') throw err;
    }
  }, opts.signal);
  for (const [key, ids] of idsByDep) {
    const dep = deps.find((d) => d.key === key)!;
    out.get(key)!.vulns = ids.map((id) => {
      const v = details.get(id);
      const fixed = v?.affected
        ?.filter((a) => !a.package || a.package.name === dep.name)
        .flatMap((a) => a.ranges ?? [])
        .flatMap((r) => r.events)
        .map((e) => e.fixed)
        .filter(Boolean)
        .pop() ?? null;
      return {
        id,
        aliases: v?.aliases ?? [],
        summary: v?.summary ?? v?.details?.slice(0, 160) ?? 'Known vulnerability',
        severity: v ? severityOf(v) : 'unknown',
        fixed,
        url: `https://osv.dev/vulnerability/${id}`,
      };
    });
  }
  if (allIds.length) opts.onProgress?.(`OSV: ${allIds.length} advisories across ${idsByDep.size} packages`);

  // ── 3. deps.dev: latest version, publish dates, licenses (budgeted)
  const budget = opts.registryBudget ?? 150;
  const lookups = deps.filter((d) => DEPSDEV_SYSTEM[d.ecosystem]).slice(0, budget);
  let done = 0;
  await pool(lookups, 10, async (d) => {
    const system = DEPSDEV_SYSTEM[d.ecosystem]!;
    const base = `https://api.deps.dev/v3/systems/${system}/packages/${encodeURIComponent(d.name)}`;
    try {
      const res = await fetch(base, { signal: opts.signal });
      if (!res.ok) return;
      const pkg = (await res.json()) as { versions: { versionKey: { version: string }; publishedAt?: string; isDefault?: boolean; isDeprecated?: boolean }[] };
      const e = out.get(d.key)!;
      const def = pkg.versions.find((v) => v.isDefault) ?? pkg.versions[pkg.versions.length - 1];
      if (def) {
        e.latest = def.versionKey.version;
        e.latestPublished = def.publishedAt;
        e.deprecated = def.isDeprecated;
      }
      if (d.version) {
        const cur = pkg.versions.find((v) => v.versionKey.version === d.version);
        e.versionPublished = cur?.publishedAt;
      }
      if (def) {
        const vr = await fetch(`${base}/versions/${encodeURIComponent(def.versionKey.version)}`, { signal: opts.signal });
        if (vr.ok) e.licenses = ((await vr.json()) as { licenses?: string[] }).licenses;
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') throw err;
    } finally {
      done++;
      if (done % 40 === 0) opts.onProgress?.(`Registry metadata: ${done}/${lookups.length} packages`);
    }
  }, opts.signal);
  return out;
}
