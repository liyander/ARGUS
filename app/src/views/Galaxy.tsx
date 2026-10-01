import { useReducedMotion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { LAYER_LABELS } from '../analyzers/repo/catalog';
import { Icon } from '../components/Icon';
import { Chip, EmptyState, LayerDot } from '../components/ui';
import { LAYERS, type GraphNode } from '../core/model';
import { GalaxyEngine, type ColorMode } from '../graph/galaxy';
import { compact, languageColor } from '../lib/util';
import { neighbourhood, useAnalysis } from '../store/analysis';
import { useShallow } from 'zustand/react/shallow';
import { useUi } from '../store/ui';
import { useViewActive } from './registry';

export default function Galaxy() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engine = useRef<GalaxyEngine | null>(null);
  const { analysis, idx, selectedId, focusMode } = useAnalysis(useShallow((s) => ({ analysis: s.analysis, idx: s.idx, selectedId: s.selectedId, focusMode: s.focusMode })));
  const theme = useUi((s) => s.theme);
  const reduce = useReducedMotion() ?? false;
  const [hover, setHover] = useState<{ node: GraphNode; x: number; y: number } | null>(null);
  const [mode, setMode] = useState<ColorMode>('layer');
  const [stats, setStats] = useState({ stars: 0, clusters: 0, trails: 0 });
  const hasFiles = analysis?.nodes.some((n) => n.kind === 'file');

  useEffect(() => {
    if (!canvasRef.current || !hasFiles) return;
    const e = new GalaxyEngine(canvasRef.current, {
      onHover: (node, pos) => setHover(node && pos ? { node, ...pos } : null),
      onClick: (node) => useAnalysis.getState().select(node?.id ?? null),
    }, reduce);
    engine.current = e;
    return () => {
      e.destroy();
      engine.current = null;
    };
  }, [hasFiles, reduce]);

  useEffect(() => {
    if (!engine.current || !analysis) return;
    engine.current.setData(analysis.nodes, analysis.edges);
    setStats(engine.current.stats());
  }, [analysis, hasFiles]);

  useEffect(() => {
    engine.current?.setSelection(selectedId, neighbourhood(idx, selectedId), focusMode);
  }, [selectedId, focusMode, idx, hasFiles]);

  useEffect(() => {
    engine.current?.setColorMode(mode);
  }, [mode]);

  const active = useViewActive();
  useEffect(() => {
    engine.current?.setActive(active);
  }, [active, hasFiles]);

  useEffect(() => {
    // theme tokens changed → re-read colours after the attribute flips
    const id = requestAnimationFrame(() => engine.current?.readTheme());
    return () => cancelAnimationFrame(id);
  }, [theme]);

  if (!hasFiles) {
    return <EmptyState icon="galaxy" title="The galaxy forms as files are parsed">Stars appear here as soon as the first source files are downloaded and parsed.</EmptyState>;
  }

  const langs = mode === 'language'
    ? Object.entries(analysis!.context.languages ?? {}).sort((a, b) => b[1] - a[1]).slice(0, 7).map(([l]) => l)
    : [];

  return (
    <div className="relative h-full w-full overflow-hidden">
      <canvas ref={canvasRef} className="absolute inset-0 block touch-none" style={{ cursor: 'grab' }} aria-label="Codebase galaxy: files as stars, modules as clusters, imports as trails" />

      <div data-no-export className="absolute left-3 top-3 z-10 flex flex-wrap items-center gap-1.5">
        {(['layer', 'language', 'module'] as ColorMode[]).map((m) => (
          <Chip key={m} active={mode === m} onClick={() => setMode(m)}>colour by {m}</Chip>
        ))}
        <button type="button" onClick={() => engine.current?.replay()} className="focus-ring ml-1 flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-xs text-muted hover:text-text" title="Replay the reveal">
          <Icon name="refresh" size={12} /> replay
        </button>
        <button type="button" onClick={() => engine.current?.fit(true)} className="focus-ring flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-xs text-muted hover:text-text">
          <Icon name="focus" size={12} /> fit
        </button>
      </div>

      <div className="glass pointer-events-none absolute bottom-3 right-3 z-10 rounded-xl px-3 py-2 text-[11px] text-muted">
        <div className="mono mb-1.5 text-text">{compact(stats.stars)} stars · {stats.clusters} constellations · {compact(stats.trails)} trails</div>
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {mode === 'layer' && LAYERS.filter((l) => l !== 'external').map((l) => (
            <span key={l} className="flex items-center gap-1.5"><LayerDot layer={l} size={6} />{LAYER_LABELS[l]}</span>
          ))}
          {mode === 'language' && langs.map((l) => (
            <span key={l} className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full" style={{ background: languageColor(l) }} />{l}</span>
          ))}
          {mode === 'module' && <span>each constellation is a folder module</span>}
        </div>
      </div>

      {hover && (
        <div className="glass pointer-events-none absolute z-20 max-w-xs rounded-lg px-2.5 py-1.5 text-xs" style={{ left: hover.x + 14, top: hover.y + 14, background: 'var(--panel-solid)' }}>
          <div className="mono truncate text-text">{String(hover.node.meta.path)}</div>
          <div className="mt-0.5 text-faint">{String(hover.node.meta.language)} · {Number(hover.node.meta.loc).toLocaleString()} lines{hover.node.meta.routes ? ` · ${hover.node.meta.routes} routes` : ''}</div>
        </div>
      )}
    </div>
  );
}
