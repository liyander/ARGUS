import type { Analysis, HealthFactor, HealthScore } from './model';

/** Lighthouse-style score for architecture and dependencies. Each factor is 0..100, weighted. */

export function grade(score: number): string {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

function combine(factors: HealthFactor[]): HealthScore {
  const total = factors.reduce((s, f) => s + f.weight, 0) || 1;
  const score = Math.round(factors.reduce((s, f) => s + f.score * f.weight, 0) / total);
  return { score, grade: grade(score), factors };
}

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export interface RepoHealthInput {
  sourceFiles: number;
  testFiles: number;
  hasCi: boolean;
  hasReadme: boolean;
  hasDocsDir: boolean;
  hasLicense: boolean;
  hasContributing: boolean;
  bigFiles: number;
  analyzedFiles: number;
  moduleCycles: number;
  moduleCount: number;
}

export function repoHealth(analysis: Analysis, input: RepoHealthInput): HealthScore {
  const deps = analysis.nodes.filter((n) => n.kind === 'dependency');
  const prodDeps = deps.filter((d) => !d.meta.dev);
  const sev = { critical: 0, high: 0, moderate: 0, low: 0, unknown: 0 };
  // dev-only packages don't ship to users: their advisories count a quarter
  const weighted = { critical: 0, high: 0, moderate: 0, low: 0, unknown: 0 };
  for (const d of deps) {
    for (const v of (d.meta.vulns as { severity: keyof typeof sev; rangeAllowsFix?: boolean }[] | undefined) ?? []) {
      sev[v.severity]++;
      weighted[v.severity] += (d.meta.dev ? 0.25 : 1) * (v.rangeAllowsFix ? 0.2 : 1);
    }
  }
  const vulnCount = Object.values(sev).reduce((a, b) => a + b, 0);
  const penalty = weighted.critical * 15 + weighted.high * 8 + weighted.moderate * 3 + (weighted.low + weighted.unknown) * 1;
  const security = clamp(100 * Math.exp(-penalty / 60));

  const checked = prodDeps.filter((d) => d.meta.latest);
  const outdated = checked.filter((d) => d.meta.majorsBehind && (d.meta.majorsBehind as number) > 0).length;
  const stale = checked.filter((d) => d.meta.stale).length;
  const freshness = checked.length ? clamp(100 - ((outdated + stale * 0.5) / checked.length) * 110) : 70;

  const ratio = input.sourceFiles ? input.testFiles / input.sourceFiles : 0;
  const testing = input.testFiles === 0 ? 10 : clamp(35 + (ratio / 0.3) * 65);

  const docs = clamp((input.hasReadme ? 50 : 0) + (input.hasDocsDir ? 20 : 0) + (input.hasLicense ? 20 : 0) + (input.hasContributing ? 10 : 0));

  const bigShare = input.analyzedFiles ? input.bigFiles / input.analyzedFiles : 0;
  const cycleShare = input.moduleCount ? input.moduleCycles / input.moduleCount : 0;
  const structure = clamp(100 - bigShare * 300 - cycleShare * 120);

  return combine([
    { label: 'Dependency security', score: security, weight: 30, detail: vulnCount ? `${vulnCount} advisories match the declared minimum versions (${sev.critical} critical, ${sev.high} high; dev-only and range-fixable weighted lower)` : 'No known vulnerabilities in declared versions' },
    { label: 'Dependency freshness', score: freshness, weight: 15, detail: checked.length ? `${outdated} of ${checked.length} production packages are a major version behind; ${stale} unpublished for 2+ years` : `${prodDeps.length} dependencies, registry data unavailable` },
    { label: 'Testing', score: testing, weight: 15, detail: `${input.testFiles} test files for ${input.sourceFiles} source files` },
    { label: 'Structure', score: structure, weight: 20, detail: `${input.moduleCycles} circular module dependencies, ${input.bigFiles} files over 800 lines` },
    { label: 'CI/CD', score: input.hasCi ? 100 : 25, weight: 10, detail: input.hasCi ? 'Automated workflows found' : 'No CI configuration detected' },
    { label: 'Documentation', score: docs, weight: 10, detail: [input.hasReadme && 'README', input.hasDocsDir && 'docs/', input.hasLicense && 'LICENSE', input.hasContributing && 'CONTRIBUTING'].filter(Boolean).join(', ') || 'No README or license' },
  ]);
}

export interface UrlHealthInput {
  https: boolean;
  securityHeaders: { name: string; present: boolean }[];
  thirdParties: number;
  exposedSourceMaps: number;
  mixedContent: number;
}

export function urlHealth(input: UrlHealthInput): HealthScore {
  const present = input.securityHeaders.filter((h) => h.present).length;
  const headers = clamp((present / Math.max(1, input.securityHeaders.length)) * 100);
  return combine([
    { label: 'Transport security', score: input.https ? (input.mixedContent ? 60 : 100) : 0, weight: 25, detail: input.https ? (input.mixedContent ? `${input.mixedContent} insecure http:// resources` : 'Served over HTTPS') : 'Not served over HTTPS' },
    { label: 'Security headers', score: headers, weight: 35, detail: `${present} of ${input.securityHeaders.length} recommended headers present` },
    { label: 'Third-party footprint', score: clamp(100 - Math.max(0, input.thirdParties - 4) * 6), weight: 20, detail: `${input.thirdParties} third-party domains loaded` },
    { label: 'Source exposure', score: input.exposedSourceMaps ? 40 : 100, weight: 20, detail: input.exposedSourceMaps ? `${input.exposedSourceMaps} public source maps reveal original code` : 'No public source maps found' },
  ]);
}
