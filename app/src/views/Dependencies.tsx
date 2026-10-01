import { motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import type { VulnInfo } from '../analyzers/repo/enrich';
import { Icon } from '../components/Icon';
import { Chip, EmptyState } from '../components/ui';
import type { GraphNode } from '../core/model';
import { timeAgo } from '../lib/util';
import { useAnalysis } from '../store/analysis';
import { useShallow } from 'zustand/react/shallow';

type Status = 'vulnerable' | 'deprecated' | 'outdated' | 'stale' | 'ok' | 'unknown';

const STATUS: Record<Status, { label: string; color: string }> = {
  vulnerable: { label: 'Vulnerable', color: 'var(--danger)' },
  deprecated: { label: 'Deprecated', color: 'var(--danger)' },
  outdated: { label: 'Major behind', color: 'var(--warn)' },
  stale: { label: 'Stale (2y+)', color: 'var(--l-data)' },
  ok: { label: 'Healthy', color: 'var(--ok)' },
  unknown: { label: 'Unchecked', color: 'var(--faint)' },
};

export function depStatus(d: GraphNode): Status {
  if (((d.meta.vulns as VulnInfo[]) ?? []).length) return 'vulnerable';
  if (d.meta.deprecated) return 'deprecated';
  if (Number(d.meta.majorsBehind ?? 0) > 0) return 'outdated';
  if (d.meta.stale) return 'stale';
  if (d.meta.latest || d.meta.vulns) return 'ok';
  return 'unknown';
}

export default function Dependencies() {
  const { analysis, select, selectedId } = useAnalysis(useShallow((s) => ({ analysis: s.analysis, select: s.select, selectedId: s.selectedId })));
  const [scope, setScope] = useState<'all' | 'prod' | 'dev'>('prod');
  const [statusFilter, setStatusFilter] = useState<Status | null>(null);
  const [eco, setEco] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const deps = useMemo(() => (analysis?.nodes ?? []).filter((n) => n.kind === 'dependency'), [analysis]);
  const ecosystems = [...new Set(deps.map((d) => String(d.meta.ecosystem)))];
  const scoped = deps.filter((d) => scope === 'all' || (scope === 'dev' ? d.meta.dev : !d.meta.dev));
  const counts = useMemo(() => {
    const c: Record<Status, number> = { vulnerable: 0, deprecated: 0, outdated: 0, stale: 0, ok: 0, unknown: 0 };
    for (const d of scoped) c[depStatus(d)]++;
    return c;
  }, [scoped]);
  const visible = scoped
    .filter((d) => !statusFilter || depStatus(d) === statusFilter)
    .filter((d) => !eco || d.meta.ecosystem === eco)
    .filter((d) => !query || d.label.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => order(depStatus(a)) - order(depStatus(b)) || Number(b.meta.usedBy ?? 0) - Number(a.meta.usedBy ?? 0));

  if (!deps.length) {
    return <EmptyState icon="dependencies" title="No dependencies found">{analysis?.mode === 'url' ? 'URL mode only sees libraries whose version banner survives bundling (e.g. React, jQuery, Vue).' : 'No package manifests (package.json, requirements.txt, go.mod, …) were found.'}</EmptyState>;
  }

  const licenses = topLicenses(scoped);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[1400px] space-y-4 p-4 lg:p-6">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,420px)_1fr]">
          <div className="glass rounded-2xl p-3">
            <Radial deps={scoped} selectedId={selectedId} onSelect={select} />
          </div>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {(Object.keys(STATUS) as Status[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatusFilter(statusFilter === s ? null : s)}
                  className={`glass glass-hover focus-ring rounded-xl p-3 text-left ${statusFilter === s ? 'ring-1' : ''}`}
                  style={statusFilter === s ? { borderColor: STATUS[s].color } : undefined}
                >
                  <div className="flex items-center gap-1.5 text-xs text-muted"><span className="h-2 w-2 rounded-full" style={{ background: STATUS[s].color }} />{STATUS[s].label}</div>
                  <div className="mt-1 text-2xl font-semibold tabular-nums" style={{ color: counts[s] && s !== 'ok' && s !== 'unknown' ? STATUS[s].color : undefined }}>{counts[s]}</div>
                </button>
              ))}
            </div>
            <div className="glass rounded-xl p-3 text-xs">
              <div className="mb-2 text-muted">Licenses</div>
              <div className="flex flex-wrap gap-1.5">
                {licenses.map(([l, n]) => (
                  <span key={l} className={`mono rounded border px-1.5 py-0.5 ${/GPL|AGPL|SSPL|BUSL/i.test(l) ? 'border-warn text-warn' : 'border-line text-muted'}`}>{l} · {n}</span>
                ))}
                {!licenses.length && <span className="text-faint">License data appears after registry enrichment.</span>}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {(['prod', 'dev', 'all'] as const).map((s) => <Chip key={s} active={scope === s} onClick={() => setScope(s)}>{s === 'prod' ? 'production' : s === 'dev' ? 'development' : 'all'}</Chip>)}
              <span className="mx-1 h-4 w-px bg-line" />
              {ecosystems.length > 1 && ecosystems.map((e) => <Chip key={e} active={eco === e} onClick={() => setEco(eco === e ? null : e)}>{e}</Chip>)}
              <div className="glass ml-auto flex items-center gap-2 rounded-lg px-2.5 py-1">
                <Icon name="search" size={13} className="text-faint" />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="package…" className="mono w-32 bg-transparent text-xs outline-none" />
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {visible.slice(0, 400).map((d, i) => {
            const st = depStatus(d);
            const vulns = (d.meta.vulns as VulnInfo[]) ?? [];
            return (
              <motion.button
                key={d.id}
                type="button"
                onClick={() => select(d.id)}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i, 30) * 0.012 }}
                className={`glass glass-hover focus-ring relative overflow-hidden rounded-xl p-3 text-left ${selectedId === d.id ? 'border-accent' : ''}`}
              >
                <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: STATUS[st].color }} />
                <div className="flex items-center gap-2">
                  <span className="mono truncate text-[13px] font-medium">{d.label}</span>
                  {vulns.length > 0 && <span className="mono ml-auto shrink-0 rounded-full px-1.5 text-[10px] text-danger" style={{ background: 'color-mix(in srgb, var(--danger) 14%, transparent)' }}>{vulns.length} CVE</span>}
                </div>
                <div className="mono mt-1 flex items-center gap-1.5 text-[11px] text-muted">
                  <span>{String(d.meta.spec)}</span>
                  {typeof d.meta.latest === 'string' && <><Icon name="arrowRight" size={10} /><span style={{ color: st === 'outdated' ? 'var(--warn)' : undefined }}>{d.meta.latest}</span></>}
                </div>
                <div className="mt-1.5 flex items-center gap-2 text-[11px] text-faint">
                  <span>{String(d.meta.license ?? '—')}</span>
                  {typeof d.meta.latestPublished === 'string' && <span>· {timeAgo(d.meta.latestPublished)}</span>}
                  {typeof d.meta.usedBy === 'number' && d.meta.usedBy > 0 && <span className="ml-auto">{d.meta.usedBy} files</span>}
                </div>
              </motion.button>
            );
          })}
        </div>
        {visible.length > 400 && <div className="text-center text-xs text-faint">Showing 400 of {visible.length}. Use the filters to narrow down.</div>}
      </div>
    </div>
  );
}

function order(s: Status) {
  return ['vulnerable', 'deprecated', 'outdated', 'stale', 'ok', 'unknown'].indexOf(s);
}

function topLicenses(deps: GraphNode[]) {
  const m = new Map<string, number>();
  for (const d of deps) if (d.meta.license) m.set(String(d.meta.license), (m.get(String(d.meta.license)) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
}

/** Radial graph: the project in the centre, packages around it, sized by usage, coloured by health. */
function Radial({ deps, selectedId, onSelect }: { deps: GraphNode[]; selectedId: string | null; onSelect: (id: string) => void }) {
  const size = 400;
  const c = size / 2;
  const sorted = [...deps].sort((a, b) => order(depStatus(a)) - order(depStatus(b)) || a.label.localeCompare(b.label)).slice(0, 160);
  const rings = sorted.length > 60 ? 2 : 1;
  const maxUse = Math.max(1, ...sorted.map((d) => Number(d.meta.usedBy ?? 0)));
  const [hover, setHover] = useState<GraphNode | null>(null);
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="w-full" role="img" aria-label="Dependency radial graph">
      {[0.62, 0.9].slice(0, rings).map((r) => <circle key={r} cx={c} cy={c} r={c * r} fill="none" stroke="var(--line)" strokeDasharray="2 4" />)}
      {sorted.map((d, i) => {
        const ring = rings === 2 ? i % 2 : 0;
        const r = c * (ring ? 0.62 : 0.9) - 8;
        const ang = (i / sorted.length) * Math.PI * 2 - Math.PI / 2;
        const x = c + Math.cos(ang) * r;
        const y = c + Math.sin(ang) * r;
        const st = depStatus(d);
        const dotR = 2.5 + (Number(d.meta.usedBy ?? 0) / maxUse) * 6;
        const active = d.id === selectedId || d.id === hover?.id;
        return (
          <g key={d.id} onClick={() => onSelect(d.id)} onMouseEnter={() => setHover(d)} onMouseLeave={() => setHover(null)} className="cursor-pointer">
            <line x1={c} y1={c} x2={x} y2={y} stroke={STATUS[st].color} strokeOpacity={active ? 0.9 : st === 'ok' || st === 'unknown' ? 0.08 : 0.3} strokeWidth={active ? 1.5 : 0.8} />
            <circle cx={x} cy={y} r={dotR + (active ? 2 : 0)} fill={STATUS[st].color} style={{ filter: st === 'vulnerable' ? `drop-shadow(0 0 6px ${STATUS[st].color})` : undefined }} />
          </g>
        );
      })}
      <circle cx={c} cy={c} r={34} fill="var(--panel-solid)" stroke="var(--accent)" strokeOpacity={0.5} />
      <text x={c} y={c - 2} textAnchor="middle" className="fill-[var(--text)]" style={{ fontSize: 18, fontWeight: 600 }}>{deps.length}</text>
      <text x={c} y={c + 14} textAnchor="middle" style={{ fontSize: 9, fill: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>packages</text>
      {hover && (
        <text x={c} y={size - 8} textAnchor="middle" style={{ fontSize: 11, fill: 'var(--text)', fontFamily: 'var(--font-mono)' }}>
          {hover.label} {String(hover.meta.spec)}
        </text>
      )}
    </svg>
  );
}
