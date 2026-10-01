import type { ElkNode } from 'elkjs/lib/elk-api';
import type { Layer } from '../core/model';
import type { ArchEdge, ArchNode } from './arch';

/** Column order, left → right. Infra sits at the far right as the "ground" layer. */
export const LAYER_ORDER: Layer[] = ['frontend', 'api', 'service', 'data', 'external', 'infra'];

export const NODE_W = 220;
export const NODE_H = 64;

let elkPromise: Promise<{ layout: (g: ElkNode) => Promise<ElkNode> }> | null = null;
function getElk() {
  elkPromise ??= import('elkjs/lib/elk.bundled.js').then((m) => new m.default());
  return elkPromise;
}

export interface Positioned {
  positions: Map<string, { x: number; y: number }>;
  bands: { layer: Layer; x: number; y: number; w: number; h: number }[];
}

/** ELK layered layout, partitioned so every layer becomes its own column. */
export async function layoutArch(nodes: ArchNode[], edges: ArchEdge[]): Promise<Positioned> {
  const elk = await getElk();
  const present = LAYER_ORDER.filter((l) => nodes.some((n) => n.layer === l));
  const layerOf = new Map(nodes.map((n) => [n.id, n.layer]));
  const graph: ElkNode = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': 'RIGHT',
      'elk.partitioning.activate': 'true',
      'elk.layered.spacing.nodeNodeBetweenLayers': '90',
      'elk.spacing.nodeNode': '18',
      'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
      'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
      'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
      'elk.separateConnectedComponents': 'false',
    },
    children: nodes.map((n) => ({
      id: n.id,
      width: NODE_W,
      height: NODE_H,
      layoutOptions: { 'elk.partitioning.partition': String(present.indexOf(n.layer)) },
    })),
    // same-layer edges are drawn but not laid out, so each layer stays one column
    edges: edges
      .filter((e) => layerOf.get(e.source) !== layerOf.get(e.target))
      .map((e) => ({ id: e.id, sources: [e.source], targets: [e.target] })),
  };
  const res = await elk.layout(graph);
  const positions = new Map<string, { x: number; y: number }>();
  for (const c of res.children ?? []) positions.set(c.id, { x: c.x ?? 0, y: c.y ?? 0 });

  // background band per layer
  const PAD = 26;
  const bands: Positioned['bands'] = [];
  const top = Math.min(...[...positions.values()].map((p) => p.y)) - PAD - 24;
  const bottom = Math.max(...[...positions.values()].map((p) => p.y + NODE_H)) + PAD;
  for (const layer of present) {
    const ps = nodes.filter((n) => n.layer === layer).map((n) => positions.get(n.id)!).filter(Boolean);
    if (!ps.length) continue;
    const x0 = Math.min(...ps.map((p) => p.x)) - PAD;
    const x1 = Math.max(...ps.map((p) => p.x + NODE_W)) + PAD;
    bands.push({ layer, x: x0, y: top, w: x1 - x0, h: bottom - top });
  }
  return { positions, bands };
}
