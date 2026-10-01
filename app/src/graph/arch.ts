import type { Analysis, Confidence, GraphEdge, GraphNode, Layer } from '../core/model';

/** Builds the architecture-level graph (modules + technologies) from an Analysis. */

export interface ArchNode {
  id: string;
  label: string;
  sub: string;
  layer: Layer;
  kind: GraphNode['kind'];
  confidence: Confidence;
  logo?: string;
  badges: { label: string; tone: 'danger' | 'accent' | 'muted' }[];
  /** node in the Analysis that this card represents (for the detail panel) */
  ref: string | null;
  weight: number;
}

export interface ArchEdge {
  id: string;
  source: string;
  target: string;
  kind: GraphEdge['kind'];
  confidence: Confidence;
  weight: number;
}

const TOOLING = new Set(['Testing', 'Tooling', 'Build tool', 'Language', 'Monorepo', 'UI workshop', 'Bundler', 'Styling', 'Component library', 'State', 'Data fetching', 'Validation', 'Routing', 'Visualization', 'Graphics']);
const MAX_MODULES = 36;

export function buildArchGraph(a: Analysis): { nodes: ArchNode[]; edges: ArchEdge[]; hiddenModules: number } {
  const nodes: ArchNode[] = [];
  const edges: ArchEdge[] = [];
  const keep = new Set<string>();

  const modules = a.nodes.filter((n) => n.kind === 'module').sort((x, y) => Number(y.meta.loc ?? 0) - Number(x.meta.loc ?? 0));
  const shownModules = a.mode === 'repo' ? modules.slice(0, MAX_MODULES) : modules;
  for (const m of shownModules) {
    keep.add(m.id);
    const ep = Number(m.meta.endpoints ?? 0);
    nodes.push({
      id: m.id,
      label: m.label,
      sub: a.mode === 'repo' ? `${m.meta.files ?? 0} files · ${compactLoc(Number(m.meta.loc ?? 0))} LOC` : String(m.meta.rendering ?? m.meta.role ?? ''),
      layer: m.layer ?? 'service',
      kind: 'module',
      confidence: m.confidence,
      badges: ep ? [{ label: `${ep} endpoint${ep > 1 ? 's' : ''}`, tone: 'accent' }] : [],
      ref: m.id,
      weight: Number(m.meta.loc ?? 1),
    });
  }

  // technologies (skip tooling noise; group third parties by category in URL mode)
  for (const n of a.nodes) {
    if (!['framework', 'service', 'datastore', 'infra'].includes(n.kind)) continue;
    const cat = String(n.meta.category ?? '');
    if (n.kind === 'framework' && TOOLING.has(cat) && n.layer !== 'data') continue;
    if (n.meta.dev === true && n.kind !== 'datastore') continue;
    keep.add(n.id);
    nodes.push({
      id: n.id,
      label: n.label,
      sub: [cat, n.meta.version ? `v${n.meta.version}` : ''].filter(Boolean).join(' · '),
      layer: n.layer ?? (n.kind === 'datastore' ? 'data' : n.kind === 'infra' ? 'infra' : 'external'),
      kind: n.kind,
      confidence: n.confidence,
      logo: n.meta.logo as string | undefined,
      badges: [],
      ref: n.id,
      weight: 1,
    });
  }

  const tps = a.nodes.filter((n) => n.kind === 'thirdParty');
  const byCat = new Map<string, GraphNode[]>();
  for (const t of tps) {
    const cat = String(t.meta.category ?? 'Other');
    if (!byCat.has(cat)) byCat.set(cat, []);
    byCat.get(cat)!.push(t);
  }
  for (const [cat, list] of byCat) {
    const id = `tpcat:${cat}`;
    keep.add(id);
    nodes.push({
      id,
      label: cat,
      sub: list.slice(0, 3).map((t) => t.label).join(', ') + (list.length > 3 ? ` +${list.length - 3}` : ''),
      layer: 'external',
      kind: 'thirdParty',
      confidence: list.some((t) => t.confidence === 'confirmed') ? 'confirmed' : 'likely',
      badges: [{ label: String(list.length), tone: 'muted' }],
      ref: list.length === 1 ? list[0].id : null,
      weight: list.length,
    });
  }

  // edges: keep those between shown nodes; third parties map to their category node
  const tpCat = new Map(tps.map((t) => [t.id, `tpcat:${String(t.meta.category ?? 'Other')}`]));
  const layerOfNode = new Map(nodes.map((n) => [n.id, n.layer]));
  const seen = new Map<string, ArchEdge>();
  for (const e of a.edges) {
    if (e.source.startsWith('file:') || e.target.startsWith('file:') || e.kind === 'handles') continue;
    let s = tpCat.get(e.source) ?? e.source;
    let t = tpCat.get(e.target) ?? e.target;
    // "host serves site" reads better left-to-right as site → host
    if (e.kind === 'servesFrom') [s, t] = [t, s];
    if (!keep.has(s) || !keep.has(t) || s === t) continue;
    if (e.kind === 'dependsOn' && layerOfNode.get(s) === layerOfNode.get(t)) continue;
    const id = `${s}->${t}`;
    const prev = seen.get(id);
    if (prev) prev.weight += e.weight ?? 1;
    else seen.set(id, { id, source: s, target: t, kind: e.kind, confidence: e.confidence, weight: e.weight ?? 1 });
  }
  edges.push(...seen.values());

  // vulnerability badges on catalog nodes from their packages
  const vulnByPkg = new Map<string, number>();
  for (const d of a.nodes) if (d.kind === 'dependency' && d.meta.catalog) vulnByPkg.set(String(d.meta.catalog), (vulnByPkg.get(String(d.meta.catalog)) ?? 0) + ((d.meta.vulns as unknown[])?.length ?? 0));
  for (const n of nodes) {
    const v = vulnByPkg.get(n.id);
    if (v) n.badges.push({ label: `${v} vuln${v > 1 ? 's' : ''}`, tone: 'danger' });
  }

  return { nodes, edges, hiddenModules: Math.max(0, modules.length - shownModules.length) };
}

function compactLoc(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n);
}
