import { useReducedMotion } from 'framer-motion';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { Chip, ConfidenceBadge, EmptyState, LayerDot, MethodBadge } from '../components/ui';
import type { DotsScene } from '../graph/dots-scene';
import { buildScenarios, type Scenario } from '../graph/flows';
import { useAnalysis } from '../store/analysis';
import { useShallow } from 'zustand/react/shallow';
import { useUi } from '../store/ui';
import { useViewActive } from './registry';

const SPEEDS = [0.5, 1, 2];

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

/**
 * Dots: an interactive, 3D walk-through of how a request travels through the
 * system — client → edge → handler → services → ORM → database / cache / queue →
 * external APIs — and back. Built from the real graph; inferred hops are dashed.
 */
export default function Dots() {
  const { analysis, select, selectedId } = useAnalysis(useShallow((s) => ({ analysis: s.analysis, select: s.select, selectedId: s.selectedId })));
  const theme = useUi((s) => s.theme);
  const reduce = useReducedMotion() ?? false;
  const [params, setParams] = useSearchParams();
  const stageRef = useRef<HTMLDivElement>(null);
  const engine = useRef<DotsScene | null>(null);
  const [ready, setReady] = useState(false);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(!reduce);
  const [speed, setSpeed] = useState(1);
  const [traffic, setTraffic] = useState(false);
  const [query, setQuery] = useState('');
  const webgl = useMemo(hasWebGL, []);
  const stepsRef = useRef<HTMLOListElement>(null);

  const scenarios = useMemo(() => (analysis ? buildScenarios(analysis) : []), [analysis]);
  const flowParam = params.get('flow');
  const scenario: Scenario | undefined = scenarios.find((s) => s.id === flowParam) ?? scenarios[0];

  const setFlow = (id: string) =>
    setParams((p) => {
      const n = new URLSearchParams(p);
      n.set('flow', id);
      return n;
    }, { replace: true });

  // engine lifecycle (three.js is code-split: loaded on first visit to this view)
  useEffect(() => {
    if (!webgl || !stageRef.current) return;
    let disposed = false;
    let instance: DotsScene | null = null;
    import('../graph/dots-scene').then(({ DotsScene }) => {
      if (disposed || !stageRef.current) return;
      instance = new DotsScene(stageRef.current, {
        onStep: (i) => setStep(i),
        onPick: (st) => {
          if (st?.nodeId) useAnalysis.getState().select(st.nodeId);
        },
      }, reduce);
      engine.current = instance;
      setReady(true);
    });
    return () => {
      disposed = true;
      instance?.dispose();
      engine.current = null;
      setReady(false);
    };
  }, [webgl, reduce]);

  useEffect(() => {
    if (ready && scenario) engine.current?.setScenario(scenario);
  }, [ready, scenario]);

  useEffect(() => {
    if (engine.current) engine.current.playing = playing;
  }, [playing, ready]);
  useEffect(() => {
    if (engine.current) engine.current.speed = speed;
  }, [speed, ready]);
  useEffect(() => {
    engine.current?.setTraffic(traffic);
  }, [traffic, ready]);
  useEffect(() => {
    engine.current?.setSelected(selectedId);
  }, [selectedId, ready]);
  useEffect(() => {
    const id = requestAnimationFrame(() => engine.current?.setTheme());
    return () => cancelAnimationFrame(id);
  }, [theme]);

  // keep the active step visible in the timeline
  useEffect(() => {
    stepsRef.current?.querySelector(`[data-step="${step}"]`)?.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
  }, [step, reduce]);

  const active = useViewActive();
  useEffect(() => {
    engine.current?.setActive(active);
  }, [active, ready]);

  // keyboard: space play/pause, ←/→ step (only while Dots is the visible view)
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || e.metaKey || e.ctrlKey) return;
      if (e.key === ' ') {
        e.preventDefault();
        setPlaying((p) => !p);
      } else if (e.key === 'ArrowRight') {
        setPlaying(false);
        engine.current?.next();
      } else if (e.key === 'ArrowLeft') {
        setPlaying(false);
        engine.current?.prev();
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [active]);

  if (!analysis) return null;
  if (!scenarios.length) {
    return (
      <EmptyState icon="bolt" title="No request flows to animate yet">
        {analysis.mode === 'repo'
          ? 'Dots traces requests from detected endpoints through the services, data stores and external APIs they reach. No endpoints were detected in this repository.'
          : 'Dots needs a fetched page to trace. Try re-scanning.'}
      </EmptyState>
    );
  }

  const filtered = scenarios.filter((s) => !query || `${s.title} ${s.subtitle}`.toLowerCase().includes(query.toLowerCase())).slice(0, 300);
  const hop = scenario?.hops[step];
  const stationById = new Map(scenario?.stations.map((s) => [s.id, s]) ?? []);

  return (
    <div className="flex h-full flex-col lg:flex-row">
      {/* scenario list + step timeline */}
      <aside className="order-2 flex max-h-[45vh] min-h-0 flex-col border-t border-line lg:order-1 lg:max-h-none lg:w-[340px] lg:border-r lg:border-t-0">
        <div className="border-b border-line p-3">
          <div className="mono mb-2 text-[11px] uppercase tracking-wider text-faint">Flows · {scenarios.length}</div>
          <div className="glass flex items-center gap-2 rounded-lg px-2.5 py-1.5">
            <Icon name="search" size={13} className="text-faint" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find an endpoint or flow…" className="mono w-full bg-transparent text-xs outline-none placeholder:text-faint" />
          </div>
          <ul className="mt-2 max-h-40 space-y-0.5 overflow-y-auto">
            {filtered.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => setFlow(s.id)}
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition ${s.id === scenario?.id ? 'bg-accent-soft text-text' : 'text-muted hover:bg-panel-hover hover:text-text'}`}
                >
                  {s.method ? <MethodBadge method={s.method} /> : <Icon name="bolt" size={12} />}
                  <span className="mono truncate">{s.method && s.title.startsWith(s.method) ? s.title.slice(s.method.length + 1) : s.title}</span>
                  <span className="ml-auto shrink-0 text-[10px] text-faint">{s.stations.length} hops</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex items-center justify-between px-3 pt-3">
          <div className="mono text-[11px] uppercase tracking-wider text-faint">Trace · {scenario?.hops.length ?? 0} steps</div>
          <div className="flex items-center gap-2 text-[10px] text-faint">
            <span className="flex items-center gap-1"><span className="h-1.5 w-3 rounded-full bg-accent" />request</span>
            <span className="flex items-center gap-1"><span className="h-1.5 w-3 rounded-full" style={{ background: 'var(--lime)' }} />response</span>
          </div>
        </div>
        <ol ref={stepsRef} className="min-h-0 flex-1 space-y-1 overflow-y-auto p-3">
          {scenario?.hops.map((h, i) => {
            const from = stationById.get(h.from);
            const to = stationById.get(h.to);
            const active = i === step;
            const resp = h.direction === 'response';
            return (
              <li key={i} data-step={i}>
                <button
                  type="button"
                  onClick={() => {
                    setPlaying(false);
                    engine.current?.setStep(i);
                    if (h.nodeId) select(h.nodeId);
                  }}
                  className={`w-full rounded-lg border px-2.5 py-2 text-left transition ${active ? 'border-accent bg-accent-soft' : 'border-transparent hover:bg-panel-hover'}`}
                >
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="mono w-5 shrink-0 text-faint">{String(i + 1).padStart(2, '0')}</span>
                    <LayerDot layer={from?.layer} size={6} />
                    <span className="truncate text-muted">{from?.label}</span>
                    <Icon name="arrowRight" size={11} className={resp ? 'shrink-0' : 'shrink-0 text-accent'} />
                    <LayerDot layer={to?.layer} size={6} />
                    <span className="truncate text-muted">{to?.label}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 pl-7">
                    <span className="mono truncate text-[12px]" style={{ color: resp ? 'var(--lime)' : active ? 'var(--accent)' : 'var(--text)' }}>{h.label}</span>
                    {h.confidence !== 'confirmed' && <span className="ml-auto shrink-0"><ConfidenceBadge confidence={h.confidence} /></span>}
                  </div>
                  {active && (
                    <div className="mt-1 space-y-1 pl-7">
                      <div className="text-[11px] text-muted">{h.detail}</div>
                      {h.evidence && <div className="mono line-clamp-2 break-all text-[10px] text-faint">{h.evidence}</div>}
                    </div>
                  )}
                </button>
              </li>
            );
          })}
        </ol>
      </aside>

      {/* 3D stage */}
      <div className="relative order-1 min-h-[52vh] min-w-0 flex-1 lg:order-2">
        {webgl ? (
          <div ref={stageRef} className="absolute inset-0 overflow-hidden" />
        ) : (
          <EmptyState icon="bolt" title="3D needs WebGL">Your browser has WebGL disabled; the step-by-step trace on the left still works.</EmptyState>
        )}

        {scenario && (
          <div data-no-export className="pointer-events-none absolute left-3 top-3 z-10 max-w-[min(560px,calc(100%-24px))]">
            <div className="glass pointer-events-auto rounded-xl px-3 py-2">
              <div className="flex items-center gap-2">
                {scenario.method && <MethodBadge method={scenario.method} />}
                <span className="mono truncate text-sm">{scenario.method && scenario.title.startsWith(scenario.method) ? scenario.title.slice(scenario.method.length + 1) : scenario.title}</span>
              </div>
              {hop && (
                <div className="mt-1 flex items-center gap-2 text-xs">
                  <span className="mono text-faint">{step + 1}/{scenario.hops.length}</span>
                  <span style={{ color: hop.direction === 'response' ? 'var(--lime)' : 'var(--accent)' }}>{hop.label}</span>
                  <span className="truncate text-faint">· {stationById.get(hop.from)?.label} → {stationById.get(hop.to)?.label}</span>
                </div>
              )}
            </div>
          </div>
        )}

        <div data-no-export className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-2xl border border-line p-1 shadow-xl" style={{ background: 'color-mix(in srgb, var(--panel-solid) 90%, transparent)' }}>
          <button type="button" aria-label="Previous step" onClick={() => { setPlaying(false); engine.current?.prev(); }} className="focus-ring rounded-xl p-2 text-muted hover:text-text">
            <Icon name="chevron" size={16} className="rotate-180" />
          </button>
          <button type="button" aria-label={playing ? 'Pause' : 'Play'} onClick={() => setPlaying((p) => !p)} className="focus-ring flex h-9 w-9 items-center justify-center rounded-xl bg-accent text-accent-ink">
            {playing ? <span className="flex gap-1"><span className="h-3.5 w-1 rounded bg-current" /><span className="h-3.5 w-1 rounded bg-current" /></span> : <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4l13 8-13 8z" /></svg>}
          </button>
          <button type="button" aria-label="Next step" onClick={() => { setPlaying(false); engine.current?.next(); }} className="focus-ring rounded-xl p-2 text-muted hover:text-text">
            <Icon name="chevron" size={16} />
          </button>
          <span className="mx-1 h-5 w-px bg-line" />
          {SPEEDS.map((s) => (
            <button key={s} type="button" onClick={() => setSpeed(s)} className={`mono rounded-lg px-2 py-1 text-[11px] ${speed === s ? 'bg-accent-soft text-text' : 'text-muted hover:text-text'}`}>{s}×</button>
          ))}
          <span className="mx-1 h-5 w-px bg-line" />
          <Chip active={traffic} onClick={() => setTraffic((t) => !t)}>
            <Icon name="bolt" size={12} /> traffic
          </Chip>
          <button type="button" aria-label="Reframe camera" onClick={() => engine.current?.frame()} className="focus-ring rounded-xl p-2 text-muted hover:text-text" title="Reframe">
            <Icon name="focus" size={15} />
          </button>
        </div>

        <div className="pointer-events-none absolute bottom-3 right-3 z-10 hidden text-[10px] text-faint xl:block">
          drag to orbit · scroll to zoom · <span className="kbd">space</span> play · <span className="kbd">←</span><span className="kbd">→</span> step · click a station for details
        </div>
      </div>
    </div>
  );
}
