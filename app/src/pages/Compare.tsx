import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { HealthRing, scoreColor } from '../components/HealthRing';
import { Icon } from '../components/Icon';
import { ScanLog } from '../components/ScanLog';
import { TechLogo } from '../components/ui';
import { loadAnalysis, saveAnalysis } from '../core/cache';
import type { Analysis, LogLine } from '../core/model';
import { detectInput, routeFor, runAnalysis, type AnalysisInput } from '../core/pipeline';
import { loadShowcase } from '../core/showcase';
import { compact, languageColor } from '../lib/util';
import { createWorkerPool } from '../workers/pool';

interface Side {
  input: AnalysisInput | null;
  analysis: Analysis | null;
  log: LogLine[];
  progress: { fraction: number; label: string };
  error: string | null;
  running: boolean;
}

const empty: Side = { input: null, analysis: null, log: [], progress: { fraction: 0, label: '' }, error: null, running: false };

/** Runs a pipeline independently of the main workspace store. */
function useSide(raw: string | null): Side {
  const [side, setSide] = useState<Side>(empty);
  useEffect(() => {
    const input = raw ? detectInput(raw) : null;
    if (!input) {
      setSide(empty);
      return;
    }
    const controller = new AbortController();
    const t0 = performance.now();
    setSide({ ...empty, input, running: true });
    (async () => {
      const cached = (await loadAnalysis(input.mode, input.target))?.analysis ?? (input.mode === 'repo' ? await loadShowcase(input.target) : null);
      if (controller.signal.aborted) return;
      if (cached) {
        setSide((s) => ({ ...s, analysis: cached, running: false, progress: { fraction: 1, label: 'cached' } }));
        return;
      }
      try {
        const result = await runAnalysis(input, () => createWorkerPool(2), {
          signal: controller.signal,
          log: (level, text) => setSide((s) => ({ ...s, log: [...s.log, { t: performance.now() - t0, level, text }] })),
          update: (a) => setSide((s) => ({ ...s, analysis: a })),
          progress: (fraction, label) => setSide((s) => ({ ...s, progress: { fraction, label } })),
        });
        setSide((s) => ({ ...s, analysis: result, running: false }));
        void saveAnalysis(input.mode, input.target, result);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') setSide((s) => ({ ...s, error: (err as Error).message, running: false }));
      }
    })();
    return () => controller.abort();
  }, [raw]);
  return side;
}

const PAIRS = [
  ['facebook/react', 'vuejs/core'],
  ['expressjs/express', 'fastify/fastify'],
  ['vercel/next.js', 'remix-run/remix'],
  ['django/django', 'pallets/flask'],
];

export default function Compare() {
  const [params, setParams] = useSearchParams();
  const a = params.get('a');
  const b = params.get('b');
  const [da, setDa] = useState(a ?? '');
  const [db, setDb] = useState(b ?? '');
  const left = useSide(a);
  const right = useSide(b);

  const submit = () => setParams({ a: da.trim(), b: db.trim() });

  return (
    <div className="mx-auto w-full max-w-7xl flex-1 px-4 py-8">
      <h1 className="text-3xl font-semibold">Compare</h1>
      <p className="mt-1 text-muted">Two repos (or sites) side by side: health, size, stack and surface.</p>
      <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="mt-5 flex flex-col gap-2 md:flex-row md:items-center">
        <input value={da} onChange={(e) => setDa(e.target.value)} placeholder="owner/repo or URL" className="glass mono focus-ring flex-1 rounded-xl px-4 py-2.5 text-sm outline-none" />
        <span className="mono text-center text-faint">vs</span>
        <input value={db} onChange={(e) => setDb(e.target.value)} placeholder="owner/repo or URL" className="glass mono focus-ring flex-1 rounded-xl px-4 py-2.5 text-sm outline-none" />
        <button type="submit" className="focus-ring rounded-xl bg-accent px-5 py-2.5 text-sm font-medium text-accent-ink">Compare</button>
      </form>
      <div className="mt-2 flex flex-wrap gap-1.5 text-xs text-faint">
        try
        {PAIRS.map(([x, y]) => (
          <button key={x} type="button" onClick={() => { setDa(x); setDb(y); setParams({ a: x, b: y }); }} className="mono rounded-md border border-line px-2 py-0.5 text-muted hover:border-accent hover:text-accent">
            {x.split('/')[1]} vs {y.split('/')[1]}
          </button>
        ))}
      </div>

      {(left.input || right.input) && (
        <>
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <SideCard side={left} other={right} />
            <SideCard side={right} other={left} />
          </div>
          {left.analysis && right.analysis && <StackDiff a={left.analysis} b={right.analysis} />}
        </>
      )}
    </div>
  );
}

function SideCard({ side, other }: { side: Side; other: Side }) {
  const a = side.analysis;
  if (side.error) return <div className="glass rounded-2xl p-6 text-sm text-danger">{side.error}</div>;
  if (!a) {
    return (
      <div className="space-y-3">
        <div className="skeleton h-48" />
        {side.log.length > 0 && <ScanLog log={side.log} running={side.running} progress={side.progress} compact />}
      </div>
    );
  }
  const c = a.summary.counts;
  const o = other.analysis?.summary.counts ?? {};
  const metrics: [string, string][] = a.mode === 'repo'
    ? [['files', 'Files'], ['loc', 'Lines analyzed'], ['endpoints', 'Endpoints'], ['modules', 'Modules'], ['dependencies', 'Dependencies'], ['vulnerabilities', 'Vulnerabilities']]
    : [['thirdParties', 'Third parties'], ['scripts', 'Scripts'], ['endpoints', 'API routes'], ['securityHeaders', 'Security headers']];
  const langs = Object.entries(a.context.languages ?? {}).sort((x, y) => y[1] - x[1]).slice(0, 6);
  const langTotal = langs.reduce((s, [, v]) => s + v, 0) || 1;
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass rounded-2xl p-5">
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <Link to={routeFor(side.input!)} className="mono block truncate text-lg font-semibold hover:text-accent">{a.context.repo?.fullName ?? a.target}</Link>
          <div className="mt-1 line-clamp-2 text-xs text-muted">{a.context.repo?.description ?? a.context.url?.title}</div>
          {a.context.repo && <div className="mono mt-2 text-xs text-faint">{a.context.repo.stars >= 0 ? `★ ${compact(a.context.repo.stars)} · ` : ''}{a.context.repo.license ?? 'license n/a'}</div>}
        </div>
        <HealthRing health={a.summary.health} size={96} stroke={7} />
      </div>
      <div className="mt-5 space-y-2.5">
        {metrics.map(([k, label]) => {
          const v = c[k] ?? 0;
          const max = Math.max(v, o[k] ?? 0, 1);
          const better = k === 'vulnerabilities' ? v < (o[k] ?? 0) : false;
          return (
            <div key={k}>
              <div className="flex justify-between text-xs"><span className="text-muted">{label}</span><span className="mono" style={{ color: better ? 'var(--ok)' : undefined }}>{v.toLocaleString()}</span></div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-line">
                <motion.div className="h-full rounded-full" style={{ background: k === 'vulnerabilities' && v ? 'var(--danger)' : 'var(--accent)' }} initial={{ width: 0 }} animate={{ width: `${(v / max) * 100}%` }} transition={{ duration: 0.8 }} />
              </div>
            </div>
          );
        })}
      </div>
      {langs.length > 0 && (
        <div className="mt-5">
          <div className="flex h-2 overflow-hidden rounded-full">
            {langs.map(([l, v]) => <div key={l} title={l} style={{ width: `${(v / langTotal) * 100}%`, background: languageColor(l) }} />)}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 text-[11px] text-muted">{langs.map(([l]) => <span key={l} className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full" style={{ background: languageColor(l) }} />{l}</span>)}</div>
        </div>
      )}
      <div className="mt-5 space-y-1.5">
        {a.summary.health.factors.map((f) => (
          <div key={f.label} className="flex items-center gap-2 text-xs">
            <span className="w-40 truncate text-muted">{f.label}</span>
            <div className="h-1 flex-1 overflow-hidden rounded-full bg-line"><div className="h-full" style={{ width: `${f.score}%`, background: scoreColor(f.score) }} /></div>
            <span className="mono w-7 text-right" style={{ color: scoreColor(f.score) }}>{f.score}</span>
          </div>
        ))}
      </div>
      <Link to={routeFor(side.input!)} className="mt-5 inline-flex items-center gap-1.5 text-sm text-accent hover:underline">Open full map <Icon name="arrowRight" size={14} /></Link>
    </motion.div>
  );
}

function StackDiff({ a, b }: { a: Analysis; b: Analysis }) {
  const tech = (x: Analysis) => new Map(x.nodes.filter((n) => ['framework', 'service', 'datastore', 'infra'].includes(n.kind)).map((n) => [n.label, n]));
  const ta = tech(a);
  const tb = tech(b);
  const shared = [...ta.keys()].filter((k) => tb.has(k));
  const onlyA = [...ta.keys()].filter((k) => !tb.has(k));
  const onlyB = [...tb.keys()].filter((k) => !ta.has(k));
  const col = (title: string, names: string[], src: Map<string, Analysis['nodes'][number]>) => (
    <div className="glass rounded-2xl p-4">
      <div className="mb-3 text-sm text-muted">{title} <span className="text-faint">({names.length})</span></div>
      <div className="flex flex-wrap gap-1.5">
        {names.map((n) => (
          <span key={n} className="flex items-center gap-1.5 rounded-lg border border-line px-2 py-1 text-xs">
            <TechLogo slug={src.get(n)?.meta.logo as string | undefined} name={n} size={14} />{n}
          </span>
        ))}
        {!names.length && <span className="text-xs text-faint">—</span>}
      </div>
    </div>
  );
  return (
    <div className="mt-4 grid gap-4 md:grid-cols-3">
      {col(`Only ${a.context.repo?.name ?? 'left'}`, onlyA, ta)}
      {col('Shared', shared, ta)}
      {col(`Only ${b.context.repo?.name ?? 'right'}`, onlyB, tb)}
    </div>
  );
}
