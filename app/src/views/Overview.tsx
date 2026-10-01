import { motion } from 'framer-motion';
import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { VulnInfo } from '../analyzers/repo/enrich';
import { LAYER_LABELS } from '../analyzers/repo/catalog';
import { HealthRing, scoreColor } from '../components/HealthRing';
import { Icon } from '../components/Icon';
import { CountUp, LayerDot, Panel, TechLogo, layerVar } from '../components/ui';
import { LAYERS, type Analysis } from '../core/model';
import { formatBytes, languageColor } from '../lib/util';
import { useAnalysis } from '../store/analysis';

interface Finding {
  severity: 'high' | 'medium' | 'low' | 'good';
  title: string;
  detail: string;
  nodeId?: string;
  view?: string;
}

function computeFindings(a: Analysis): Finding[] {
  const out: Finding[] = [];
  const deps = a.nodes.filter((n) => n.kind === 'dependency');
  const sevRank = { critical: 4, high: 3, moderate: 2, low: 1, unknown: 0 };
  const vulnerable = deps
    .map((d) => ({ d, worst: Math.max(-1, ...((d.meta.vulns as VulnInfo[]) ?? []).map((v) => sevRank[v.severity])) }))
    .filter((x) => x.worst >= 0)
    .sort((x, y) => y.worst - x.worst);
  for (const { d, worst } of vulnerable.slice(0, 3)) {
    const v = d.meta.vulns as VulnInfo[];
    out.push({ severity: worst >= 3 ? 'high' : 'medium', title: `${d.label} has ${v.length} known ${v.length === 1 ? 'vulnerability' : 'vulnerabilities'}`, detail: v[0].summary, nodeId: d.id, view: 'dependencies' });
  }
  if (vulnerable.length > 3) out.push({ severity: 'medium', title: `${vulnerable.length - 3} more vulnerable packages`, detail: 'See the dependency health view.', view: 'dependencies' });
  const deprecated = deps.filter((d) => d.meta.deprecated);
  if (deprecated.length) out.push({ severity: 'medium', title: `${deprecated.length} deprecated package${deprecated.length > 1 ? 's' : ''}`, detail: deprecated.slice(0, 4).map((d) => d.label).join(', '), nodeId: deprecated[0].id, view: 'dependencies' });
  const behind = deps.filter((d) => Number(d.meta.majorsBehind) >= 2 && !d.meta.dev);
  if (behind.length) out.push({ severity: 'low', title: `${behind.length} production packages are 2+ majors behind`, detail: behind.slice(0, 5).map((d) => `${d.label} ${d.meta.version} → ${d.meta.latest}`).join(', '), nodeId: behind[0].id, view: 'dependencies' });

  for (const f of a.summary.health.factors) {
    if (f.label === 'CI/CD' && f.score < 50) out.push({ severity: 'medium', title: 'No CI pipeline detected', detail: 'No GitHub Actions, GitLab CI, CircleCI or Jenkins config found.' });
    if (f.label === 'Testing' && f.score < 30) out.push({ severity: 'medium', title: 'Few or no tests', detail: f.detail });
    if (f.label === 'Structure' && f.score < 70) out.push({ severity: 'low', title: 'Tangled module structure', detail: f.detail, view: 'architecture' });
    if (f.label === 'Source exposure' && f.score < 100) out.push({ severity: 'medium', title: 'Public source maps', detail: f.detail });
    if (f.label === 'Transport security' && f.score < 100) out.push({ severity: 'high', title: 'Transport security issue', detail: f.detail });
  }
  for (const h of a.context.securityHeaders ?? []) {
    if (h.present) continue;
    const major = h.name === 'content-security-policy' || h.name === 'strict-transport-security';
    out.push({ severity: major ? 'medium' : 'low', title: `Missing ${h.name}`, detail: h.advice });
  }
  if (a.mode === 'url') {
    const url = a.context.url;
    if (url?.rendering) out.push({ severity: 'good', title: url.rendering, detail: 'Inferred from the HTML payload and hydration markers.', nodeId: a.nodes.find((n) => n.kind === 'module')?.id });
    const hosts = a.nodes.filter((n) => n.kind === 'infra' && /Hosting|CDN/.test(String(n.meta.category)));
    if (hosts.length) out.push({ severity: 'good', title: `Served by ${hosts.map((h) => h.label).join(' + ')}`, detail: hosts[0].evidence[0]?.snippet ?? '', nodeId: hosts[0].id, view: 'architecture' });
    const apis = a.nodes.filter((n) => n.kind === 'service' && n.layer === 'api');
    if (apis.length) out.push({ severity: 'good', title: `${apis.length} API origin${apis.length > 1 ? 's' : ''} found in bundles`, detail: apis.map((x) => x.label).slice(0, 3).join(', '), nodeId: apis[0].id });
    const ads = a.nodes.filter((n) => n.kind === 'thirdParty' && /Advertising|Analytics/.test(String(n.meta.category)));
    if (ads.length >= 3) out.push({ severity: 'low', title: `${ads.length} analytics & ad trackers`, detail: ads.map((x) => x.label).slice(0, 5).join(', '), view: 'thirdparties' });
    if (url?.githubRepo) out.push({ severity: 'good', title: `Source on GitHub: ${url.githubRepo}`, detail: 'Open it in repo mode to see the real code.' });
  }
  const endpoints = a.nodes.filter((n) => n.kind === 'endpoint' && n.meta.method !== 'PAGE');
  if (a.mode === 'repo' && endpoints.length) out.push({ severity: 'good', title: `${endpoints.length} endpoints mapped`, detail: [...new Set(endpoints.map((e) => String(e.meta.framework)))].slice(0, 4).join(', '), view: 'endpoints' });
  const stores = a.nodes.filter((n) => n.kind === 'datastore');
  if (stores.length) out.push({ severity: 'good', title: `Data layer: ${stores.map((s) => s.label).join(', ')}`, detail: 'Detected from drivers, ORMs, schemas or container images.', nodeId: stores[0].id, view: 'architecture' });
  if (!vulnerable.length && deps.length && deps.some((d) => d.meta.vulns)) out.push({ severity: 'good', title: 'No known vulnerabilities', detail: `${deps.length} packages checked against OSV.dev` });
  return out;
}

const SEV: Record<Finding['severity'], { color: string; icon: string }> = {
  high: { color: 'var(--danger)', icon: 'alert' },
  medium: { color: 'var(--warn)', icon: 'alert' },
  low: { color: 'var(--muted)', icon: 'info' },
  good: { color: 'var(--ok)', icon: 'check' },
};

export default function Overview() {
  const analysis = useAnalysis((s) => s.analysis)!;
  const status = useAnalysis((s) => s.status);
  const select = useAnalysis((s) => s.select);
  const [, setParams] = useSearchParams();
  const findings = useMemo(() => computeFindings(analysis), [analysis]);
  const c = analysis.summary.counts;
  const h = analysis.summary.health;
  const done = status === 'done' || h.factors.length > 0;

  const stats: [string, number | undefined, string][] = analysis.mode === 'repo'
    ? [['Files', c.files, 'treemap'], ['Lines analyzed', c.loc, 'galaxy'], ['Endpoints', c.endpoints, 'endpoints'], ['Modules', c.modules, 'architecture'], ['Dependencies', c.dependencies, 'dependencies'], ['Vulnerabilities', c.vulnerabilities, 'dependencies']]
    : [['Third parties', c.thirdParties, 'thirdparties'], ['Scripts', c.scripts, 'thirdparties'], ['API routes', c.endpoints, 'endpoints'], ['Sitemap pages', c.pages, 'endpoints'], ['Security headers', c.securityHeaders, 'overview'], ['Source maps', c.sourceMaps, 'overview']];

  const tech = analysis.nodes.filter((n) => ['framework', 'service', 'datastore', 'infra'].includes(n.kind) && !(n.kind === 'service' && n.meta.category === 'API endpoint') && n.id !== 'svc:origin-backend');
  const go = (view?: string, nodeId?: string) => {
    if (nodeId) select(nodeId);
    if (view) setParams((p) => { const n = new URLSearchParams(p); n.set('view', view); return n; }, { replace: true });
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto grid max-w-[1400px] gap-4 p-4 lg:grid-cols-12 lg:p-6">
        {/* Health */}
        <Panel className="lg:col-span-5" title="Health score">
          <div className="flex flex-col items-center gap-6 p-5 sm:flex-row sm:items-start">
            {done ? <HealthRing health={h} /> : <div className="skeleton h-[168px] w-[168px] rounded-full" />}
            <ul className="w-full min-w-0 flex-1 space-y-2.5">
              {h.factors.map((f, i) => (
                <li key={f.label} title={f.detail}>
                  <div className="mb-1 flex justify-between text-xs">
                    <span className="text-muted">{f.label}</span>
                    <span className="mono" style={{ color: scoreColor(f.score) }}>{f.score}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-line">
                    <motion.div className="h-full rounded-full" style={{ background: scoreColor(f.score) }} initial={{ width: 0 }} animate={{ width: `${f.score}%` }} transition={{ delay: 0.2 + i * 0.08, duration: 0.8, ease: 'easeOut' }} />
                  </div>
                  <div className="mt-0.5 truncate text-[11px] text-faint">{f.detail}</div>
                </li>
              ))}
              {!h.factors.length && Array.from({ length: 5 }, (_, i) => <div key={i} className="skeleton h-6" />)}
            </ul>
          </div>
        </Panel>

        {/* Stat cards */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:col-span-7">
          {stats.map(([label, value, view], i) => (
            <motion.button
              key={label}
              type="button"
              onClick={() => go(view)}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="glass glass-hover focus-ring rounded-2xl p-4 text-left"
            >
              <div className="text-xs text-muted">{label}</div>
              <div className={`mt-2 text-3xl font-semibold tabular-nums ${label === 'Vulnerabilities' && value ? 'text-danger' : ''}`}>
                {value === undefined ? <span className="skeleton inline-block h-8 w-16 align-middle" /> : <CountUp value={value} />}
              </div>
            </motion.button>
          ))}
        </div>

        {/* Stack logo cloud */}
        <Panel className="lg:col-span-7" title="Stack">
          <div className="space-y-4 p-4">
            {LAYERS.map((layer) => {
              const items = tech.filter((n) => n.layer === layer);
              if (!items.length) return null;
              return (
                <div key={layer}>
                  <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-wider" style={{ color: layerVar(layer) }}>
                    <LayerDot layer={layer} size={6} /> {LAYER_LABELS[layer]}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {items.map((n, i) => (
                      <motion.button
                        key={n.id}
                        type="button"
                        onClick={() => select(n.id)}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: i * 0.03 }}
                        className={`focus-ring glass-hover flex items-center gap-2 rounded-xl border bg-bg-2/60 px-3 py-2 text-sm ${n.confidence === 'inferred' ? 'border-dashed border-line-strong' : 'border-line'}`}
                        title={`${n.meta.category ?? n.kind} · ${n.confidence}`}
                      >
                        <TechLogo slug={n.meta.logo as string | undefined} name={n.label} size={18} />
                        <span>{n.label}</span>
                        {typeof n.meta.version === 'string' && n.meta.version && <span className="mono text-[11px] text-faint">{n.meta.version}</span>}
                      </motion.button>
                    ))}
                  </div>
                </div>
              );
            })}
            {!tech.length && <div className="text-sm text-faint">{status === 'running' ? 'Detecting…' : 'No frameworks or services detected.'}</div>}
          </div>
        </Panel>

        {/* Findings */}
        <Panel className="lg:col-span-5" title="Top findings">
          <ul className="divide-y divide-line">
            {findings.map((f) => (
              <li key={f.title}>
                <button type="button" onClick={() => go(f.view, f.nodeId)} className="flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-panel-hover">
                  <Icon name={SEV[f.severity].icon} size={16} className="mt-0.5 shrink-0" />
                  <span className="min-w-0">
                    <span className="block text-sm" style={{ color: f.severity === 'good' ? undefined : SEV[f.severity].color }}>{f.title}</span>
                    <span className="block truncate text-xs text-faint">{f.detail}</span>
                  </span>
                </button>
              </li>
            ))}
            {!findings.length && <li className="px-4 py-6 text-sm text-faint">{status === 'running' ? 'Collecting findings…' : 'Nothing notable.'}</li>}
          </ul>
        </Panel>

        {analysis.mode === 'repo' ? <Languages analysis={analysis} /> : <UrlDetails analysis={analysis} />}
      </div>
    </div>
  );
}

function Languages({ analysis }: { analysis: Analysis }) {
  const langs = Object.entries(analysis.context.languages ?? {}).sort((a, b) => b[1] - a[1]);
  const total = langs.reduce((s, [, b]) => s + b, 0) || 1;
  const top = langs.slice(0, 8);
  const other = langs.slice(8).reduce((s, [, b]) => s + b, 0);
  if (!langs.length) return null;
  const stats = analysis.context.stats;
  return (
    <Panel className="lg:col-span-12" title="Languages">
      <div className="p-4">
        <div className="flex h-3 overflow-hidden rounded-full">
          {[...top, ...(other ? [['Other', other] as [string, number]] : [])].map(([l, b], i) => (
            <motion.div key={l} title={`${l} ${((b / total) * 100).toFixed(1)}%`} style={{ background: languageColor(l) }} initial={{ width: 0 }} animate={{ width: `${(b / total) * 100}%` }} transition={{ delay: i * 0.05, duration: 0.7 }} />
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs">
          {top.map(([l, b]) => (
            <span key={l} className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ background: languageColor(l) }} />
              {l} <span className="text-faint">{((b / total) * 100).toFixed(1)}%</span>
            </span>
          ))}
        </div>
        {stats && (
          <div className="mono mt-4 text-[11px] text-faint">
            analyzed {stats.filesAnalyzed.toLocaleString()} of {stats.filesInTree.toLocaleString()} files · downloaded {formatBytes(stats.bytesDownloaded)} · {(stats.durationMs / 1000).toFixed(1)}s
          </div>
        )}
      </div>
    </Panel>
  );
}

function UrlDetails({ analysis }: { analysis: Analysis }) {
  const sec = analysis.context.securityHeaders ?? [];
  const dns = analysis.context.dns ?? {};
  const headers = analysis.context.headers ?? {};
  const interesting = ['server', 'x-powered-by', 'via', 'cache-control', 'age', 'x-cache', 'cf-cache-status', 'x-vercel-cache', 'content-type', 'alt-svc'];
  return (
    <>
      <Panel className="lg:col-span-6" title="Security headers">
        <ul className="divide-y divide-line">
          {sec.map((s) => (
            <li key={s.name} className="flex items-start gap-3 px-4 py-2.5">
              <Icon name={s.present ? 'check' : 'close'} size={15} className={`mt-0.5 shrink-0 ${s.present ? 'text-ok' : 'text-danger'}`} />
              <div className="min-w-0">
                <div className="mono text-xs">{s.name}</div>
                <div className="truncate text-[11px] text-faint" title={s.value ?? s.advice}>{s.present ? s.value : s.advice}</div>
              </div>
            </li>
          ))}
        </ul>
      </Panel>
      <Panel className="lg:col-span-6" title="Response & DNS">
        <dl className="mono grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 p-4 text-[11px]">
          {interesting.filter((k) => headers[k]).map((k) => (
            <div key={k} className="contents">
              <dt className="text-faint">{k}</dt>
              <dd className="truncate" title={headers[k]}>{headers[k]}</dd>
            </div>
          ))}
          {Object.entries(dns).map(([type, values]) => (
            <div key={type} className="contents">
              <dt className="text-faint">DNS {type}</dt>
              <dd className="truncate" title={values.join('\n')}>{values.length > 2 ? `${values.slice(0, 2).join(', ')} +${values.length - 2}` : values.join(', ')}</dd>
            </div>
          ))}
        </dl>
      </Panel>
    </>
  );
}

