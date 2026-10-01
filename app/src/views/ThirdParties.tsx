import { motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import { CATEGORY_ORDER } from '../analyzers/url/thirdparty';
import { ConfidenceBadge, EmptyState, TechLogo } from '../components/ui';
import type { GraphNode } from '../core/model';
import { hashString } from '../lib/util';
import { useAnalysis } from '../store/analysis';
import { useShallow } from 'zustand/react/shallow';

/** Every external service the app talks to, hub-and-spoke by category. */
export default function ThirdParties() {
  const { analysis, select, selectedId } = useAnalysis(useShallow((s) => ({ analysis: s.analysis, select: s.select, selectedId: s.selectedId })));
  const [hoverCat, setHoverCat] = useState<string | null>(null);

  const items = useMemo(() => {
    if (!analysis) return [];
    if (analysis.mode === 'url') return analysis.nodes.filter((n) => n.kind === 'thirdParty' || (n.kind === 'service' && n.layer === 'external'));
    return analysis.nodes.filter((n) => n.kind === 'service' || n.kind === 'datastore' || (n.kind === 'infra' && /Hosting|Deploy|CDN|Edge|registry/i.test(String(n.meta.category))));
  }, [analysis]);

  const groups = useMemo(() => {
    const m = new Map<string, GraphNode[]>();
    for (const n of items) {
      const cat = String(n.meta.category ?? 'Other');
      if (!m.has(cat)) m.set(cat, []);
      m.get(cat)!.push(n);
    }
    return [...m.entries()].sort((a, b) => rank(a[0]) - rank(b[0]) || b[1].length - a[1].length);
  }, [items]);

  if (!items.length) {
    return <EmptyState icon="thirdparties" title="No external services detected">{analysis?.mode === 'repo' ? 'External services are detected from SDK imports and dependencies (Stripe, AWS, Firebase, OpenAI, Sentry…).' : 'The page does not load resources from other domains.'}</EmptyState>;
  }

  const size = 640;
  const c = size / 2;
  const R1 = 150;
  const R2 = 236;
  const center = analysis!.context.repo?.name ?? analysis!.context.url?.finalUrl.replace(/^https?:\/\//, '').replace(/\/.*$/, '') ?? 'app';
  const total = items.length;
  let acc = 0;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto grid max-w-[1400px] gap-4 p-4 lg:grid-cols-[minmax(0,640px)_1fr] lg:p-6">
        <div className="glass rounded-2xl p-2">
          <svg viewBox={`0 0 ${size} ${size}`} className="w-full" role="img" aria-label="Third-party services diagram">
            <circle cx={c} cy={c} r={R1} fill="none" stroke="var(--line)" strokeDasharray="2 5" />
            <circle cx={c} cy={c} r={R2} fill="none" stroke="var(--line)" strokeDasharray="2 5" />
            {groups.map(([cat, list]) => {
              const start = (acc / total) * Math.PI * 2 - Math.PI / 2;
              acc += list.length;
              const end = (acc / total) * Math.PI * 2 - Math.PI / 2;
              const mid = (start + end) / 2;
              const color = `hsl(${hashString(cat) % 360} 80% 66%)`;
              const cx = c + Math.cos(mid) * R1;
              const cy = c + Math.sin(mid) * R1;
              const dim = hoverCat && hoverCat !== cat;
              return (
                <g key={cat} opacity={dim ? 0.2 : 1} onMouseEnter={() => setHoverCat(cat)} onMouseLeave={() => setHoverCat(null)} style={{ transition: 'opacity .2s' }}>
                  <motion.line x1={c} y1={c} x2={cx} y2={cy} stroke={color} strokeOpacity={0.5} strokeWidth={1.5} initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.6 }} />
                  {list.map((n, i) => {
                    const a = list.length === 1 ? mid : start + ((i + 0.5) / list.length) * (end - start);
                    const x = c + Math.cos(a) * R2;
                    const y = c + Math.sin(a) * R2;
                    const sel = n.id === selectedId;
                    return (
                      <g key={n.id} onClick={() => select(n.id)} className="cursor-pointer">
                        <motion.line x1={cx} y1={cy} x2={x} y2={y} stroke={color} strokeOpacity={sel ? 0.9 : 0.3} strokeDasharray={n.confidence === 'inferred' ? '3 4' : undefined} initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ delay: 0.4 + i * 0.03, duration: 0.5 }} />
                        <motion.circle cx={x} cy={y} r={sel ? 9 : 6} fill="var(--panel-solid)" stroke={color} strokeWidth={sel ? 2.5 : 1.5} initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.6 + i * 0.03 }} />
                        <text
                          x={x + Math.cos(a) * 12}
                          y={y + Math.sin(a) * 12 + 3}
                          textAnchor={Math.cos(a) > 0.2 ? 'start' : Math.cos(a) < -0.2 ? 'end' : 'middle'}
                          style={{ fontSize: 10, fill: sel ? 'var(--text)' : 'var(--muted)', fontFamily: 'var(--font-sans)' }}
                        >
                          {n.label.length > 22 ? n.label.slice(0, 21) + '…' : n.label}
                        </text>
                      </g>
                    );
                  })}
                  <circle cx={cx} cy={cy} r={16} fill="var(--panel-solid)" stroke={color} strokeWidth={1.5} style={{ filter: `drop-shadow(0 0 8px ${color})` }} />
                  <text x={cx} y={cy + 4} textAnchor="middle" style={{ fontSize: 11, fontWeight: 600, fill: color }}>{list.length}</text>
                </g>
              );
            })}
            <circle cx={c} cy={c} r={44} fill="var(--panel-solid)" stroke="var(--accent)" strokeWidth={1.5} style={{ filter: 'drop-shadow(0 0 14px var(--accent))' }} />
            <text x={c} y={c + 4} textAnchor="middle" style={{ fontSize: 12, fontWeight: 600, fill: 'var(--text)' }}>{center.length > 14 ? center.slice(0, 13) + '…' : center}</text>
          </svg>
        </div>
        <div className="space-y-3">
          {groups.map(([cat, list]) => (
            <section key={cat} className="glass rounded-xl" onMouseEnter={() => setHoverCat(cat)} onMouseLeave={() => setHoverCat(null)}>
              <header className="flex items-center gap-2 border-b border-line px-3 py-2 text-sm">
                <span className="h-2 w-2 rounded-full" style={{ background: `hsl(${hashString(cat) % 360} 80% 66%)` }} />
                {cat}
                <span className="ml-auto text-xs text-faint">{list.length}</span>
              </header>
              <ul>
                {list.map((n) => (
                  <li key={n.id}>
                    <button type="button" onClick={() => select(n.id)} className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition hover:bg-panel-hover ${selectedId === n.id ? 'bg-accent-soft' : ''}`}>
                      <TechLogo slug={n.meta.logo as string | undefined} name={n.label} size={16} />
                      <span className="truncate">{n.label}</span>
                      <span className="mono ml-auto truncate text-[11px] text-faint">{Array.isArray(n.meta.domains) ? (n.meta.domains as string[])[0] : n.evidence[0]?.ref.split('/').pop()?.slice(0, 32)}</span>
                      <ConfidenceBadge confidence={n.confidence} />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

function rank(cat: string) {
  const i = CATEGORY_ORDER.indexOf(cat);
  return i === -1 ? 50 : i;
}
