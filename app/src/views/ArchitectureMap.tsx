import { Background, Controls, ReactFlow, ReactFlowProvider, useReactFlow, type Edge, type Node } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { LAYER_LABELS } from '../analyzers/repo/catalog';
import { Chip, EmptyState, LayerDot, layerVar, TechLogo } from '../components/ui';
import type { Layer } from '../core/model';
import { buildArchGraph, type ArchNode } from '../graph/arch';
import { LAYER_ORDER, layoutArch, NODE_W } from '../graph/elk';
import { nodeTypes, type ArchNodeData, type BandData } from '../graph/nodes';
import { useAnalysis } from '../store/analysis';
import { useShallow } from 'zustand/react/shallow';

const EDGE_COLORS: Record<string, string> = {
  imports: 'var(--line-strong)',
  calls: 'var(--l-api)',
  readsWrites: 'var(--l-data)',
  servesFrom: 'var(--l-infra)',
  dependsOn: 'var(--l-frontend)',
  handles: 'var(--l-api)',
};

function useIsNarrow() {
  const [narrow, setNarrow] = useState(() => typeof matchMedia !== 'undefined' && matchMedia('(max-width: 767px)').matches);
  useEffect(() => {
    const mq = matchMedia('(max-width: 767px)');
    const on = () => setNarrow(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return narrow;
}

export default function ArchitectureMap() {
  const narrow = useIsNarrow();
  const analysis = useAnalysis((s) => s.analysis)!;
  const graph = useMemo(() => buildArchGraph(analysis), [analysis]);
  if (!graph.nodes.length) {
    return <EmptyState icon="architecture" title="Nothing to map yet">The architecture appears as modules and technologies are detected.</EmptyState>;
  }
  if (narrow) return <ArchList nodes={graph.nodes} />;
  return (
    <ReactFlowProvider>
      <Flow graph={graph} />
    </ReactFlowProvider>
  );
}

function Flow({ graph }: { graph: ReturnType<typeof buildArchGraph> }) {
  const { selectedId, select, focusMode, idx } = useAnalysis(useShallow((s) => ({ selectedId: s.selectedId, select: s.select, focusMode: s.focusMode, idx: s.idx })));
  const [, setParams] = useSearchParams();
  const [hidden, setHidden] = useState<Set<Layer>>(new Set());
  const [layout, setLayout] = useState<Awaited<ReturnType<typeof layoutArch>> | null>(null);
  const { fitView } = useReactFlow();

  const visibleNodes = useMemo(() => graph.nodes.filter((n) => !hidden.has(n.layer)), [graph.nodes, hidden]);
  const visibleIds = useMemo(() => new Set(visibleNodes.map((n) => n.id)), [visibleNodes]);
  const visibleEdges = useMemo(() => graph.edges.filter((e) => visibleIds.has(e.source) && visibleIds.has(e.target)), [graph.edges, visibleIds]);
  const structureKey = useMemo(() => visibleNodes.map((n) => n.id).join('|') + '#' + visibleEdges.length, [visibleNodes, visibleEdges]);

  useEffect(() => {
    let alive = true;
    layoutArch(visibleNodes, visibleEdges).then((l) => {
      if (!alive) return;
      setLayout(l);
      requestAnimationFrame(() => fitView({ padding: 0.08, duration: 500, minZoom: 0.55 }));
    });
    return () => {
      alive = false;
    };
    // re-layout only when the structure changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [structureKey]);

  // map the global selection onto an architecture card (a selected file highlights its module)
  const activeId = useMemo(() => {
    if (!selectedId) return null;
    if (visibleIds.has(selectedId)) return selectedId;
    const n = idx.byId.get(selectedId);
    if (n?.kind === 'file' && visibleIds.has(`module:${n.meta.module}`)) return `module:${n.meta.module}`;
    if (n?.kind === 'endpoint' && visibleIds.has(`module:${n.meta.module}`)) return `module:${n.meta.module}`;
    if (n?.kind === 'thirdParty') return `tpcat:${n.meta.category}`;
    return null;
  }, [selectedId, visibleIds, idx]);

  const neighbours = useMemo(() => {
    if (!activeId) return null;
    const s = new Set([activeId]);
    for (const e of visibleEdges) {
      if (e.source === activeId) s.add(e.target);
      if (e.target === activeId) s.add(e.source);
    }
    return s;
  }, [activeId, visibleEdges]);

  const rfNodes = useMemo<Node[]>(() => {
    if (!layout) return [];
    const bands: Node<BandData>[] = layout.bands.map((b) => ({
      id: `band:${b.layer}`,
      type: 'band',
      position: { x: b.x, y: b.y },
      data: { layer: b.layer, w: b.w, h: b.h },
      selectable: false,
      draggable: false,
      zIndex: -1,
    }));
    const cards: Node<ArchNodeData>[] = visibleNodes
      .filter((n) => layout.positions.has(n.id))
      .map((n) => ({
        id: n.id,
        type: 'arch',
        position: layout.positions.get(n.id)!,
        data: { ...n, selected: n.id === activeId, dimmed: Boolean(focusMode && neighbours && !neighbours.has(n.id)) },
      }));
    return [...bands, ...cards];
  }, [layout, visibleNodes, activeId, focusMode, neighbours]);

  const rfEdges = useMemo<Edge[]>(() => {
    const maxW = Math.max(1, ...visibleEdges.map((e) => e.weight));
    return visibleEdges.map((e) => {
      const touches = activeId && (e.source === activeId || e.target === activeId);
      const dim = Boolean(activeId && !touches && (focusMode || neighbours));
      const color = EDGE_COLORS[e.kind] ?? 'var(--line-strong)';
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        animated: Boolean(touches) || e.kind === 'calls',
        style: {
          stroke: touches ? color : e.kind === 'imports' ? 'var(--line-strong)' : `color-mix(in srgb, ${color} 55%, transparent)`,
          strokeWidth: 1 + (Math.log(1 + e.weight) / Math.log(1 + maxW)) * 3,
          strokeDasharray: e.confidence === 'inferred' ? '5 5' : undefined,
          opacity: dim ? (focusMode ? 0.05 : 0.3) : 1,
          transition: 'opacity 0.2s',
        },
        label: touches && e.weight > 1 ? `×${e.weight}` : undefined,
        labelStyle: { fill: 'var(--muted)', fontSize: 10, fontFamily: 'var(--font-mono)' },
        labelBgStyle: { fill: 'var(--panel-solid)' },
      };
    });
  }, [visibleEdges, activeId, focusMode, neighbours]);

  const presentLayers = LAYER_ORDER.filter((l) => graph.nodes.some((n) => n.layer === l));

  return (
    <div className="relative h-full">
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        onNodeClick={(_, n) => {
          if (n.type !== 'arch') return;
          const d = n.data as unknown as ArchNodeData;
          if (d.ref) select(d.ref);
          else if (d.kind === 'thirdParty') setParams((p) => { const x = new URLSearchParams(p); x.set('view', 'thirdparties'); return x; }, { replace: true });
        }}
        onPaneClick={() => select(null)}
        nodesConnectable={false}
        nodesDraggable
        minZoom={0.15}
        maxZoom={2}
        fitView
      >
        <Background gap={22} size={1} color="var(--dot)" />
        <Controls showInteractive={false} className="!rounded-xl !border !border-line !shadow-none" />
      </ReactFlow>

      <div data-no-export className="absolute left-3 top-3 z-10 flex max-w-[calc(100%-120px)] flex-wrap gap-1.5">
        {presentLayers.map((l) => (
          <Chip key={l} active={!hidden.has(l)} color={layerVar(l)} onClick={() => setHidden((h) => { const n = new Set(h); if (n.has(l)) n.delete(l); else n.add(l); return n; })}>
            <LayerDot layer={l} size={6} /> {LAYER_LABELS[l]}
          </Chip>
        ))}
      </div>
      <div className="glass absolute bottom-3 right-3 z-10 hidden rounded-xl px-3 py-2 text-[11px] text-muted md:block">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {[['imports', 'imports'], ['calls', 'calls'], ['readsWrites', 'reads/writes'], ['servesFrom', 'serves']].map(([k, label]) => (
            <span key={k} className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded" style={{ background: EDGE_COLORS[k] }} />{label}</span>
          ))}
          <span className="flex items-center gap-1.5"><span className="h-3 w-4 rounded border border-dashed border-line-strong" />inferred</span>
        </div>
        {graph.hiddenModules > 0 && <div className="mt-1 text-faint">Showing the {graph.nodes.filter((n) => n.kind === 'module').length} largest modules · {graph.hiddenModules} smaller ones hidden</div>}
      </div>
      {!layout && <div className="absolute inset-0 flex items-center justify-center text-sm text-faint">Laying out…</div>}
    </div>
  );
}

/** Mobile: graphs simplify to layered cards. */
function ArchList({ nodes }: { nodes: ArchNode[] }) {
  const select = useAnalysis((s) => s.select);
  return (
    <div className="h-full space-y-4 overflow-y-auto p-4">
      {LAYER_ORDER.map((layer) => {
        const items = nodes.filter((n) => n.layer === layer);
        if (!items.length) return null;
        return (
          <section key={layer}>
            <div className="mono mb-2 flex items-center gap-2 text-[11px] uppercase tracking-wider" style={{ color: layerVar(layer) }}><LayerDot layer={layer} size={6} />{LAYER_LABELS[layer]}</div>
            <div className="grid gap-2">
              {items.map((n) => (
                <button key={n.id} type="button" onClick={() => n.ref && select(n.ref)} className="glass flex items-center gap-3 rounded-xl px-3 py-2.5 text-left" style={{ borderStyle: n.confidence === 'inferred' ? 'dashed' : 'solid', width: '100%', maxWidth: NODE_W * 2 }}>
                  {n.logo ? <TechLogo slug={n.logo} name={n.label} /> : <LayerDot layer={n.layer} />}
                  <span className="min-w-0"><span className="block truncate text-sm">{n.label}</span><span className="block truncate text-xs text-faint">{n.sub}</span></span>
                </button>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
