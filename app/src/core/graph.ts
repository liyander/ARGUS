import type { Confidence, Evidence, GraphEdge, GraphNode } from './model';

const RANK: Record<Confidence, number> = { inferred: 0, likely: 1, confirmed: 2 };

/** Accumulates nodes/edges with merge semantics: same id → evidence and meta merge, best confidence wins. */
export class GraphBuilder {
  nodes = new Map<string, GraphNode>();
  edges = new Map<string, GraphEdge>();

  addNode(node: GraphNode): GraphNode {
    const existing = this.nodes.get(node.id);
    if (!existing) {
      this.nodes.set(node.id, { ...node, evidence: dedupeEvidence(node.evidence) });
      return this.nodes.get(node.id)!;
    }
    existing.meta = { ...node.meta, ...existing.meta };
    existing.evidence = dedupeEvidence([...existing.evidence, ...node.evidence]).slice(0, 25);
    if (RANK[node.confidence] > RANK[existing.confidence]) existing.confidence = node.confidence;
    existing.layer ??= node.layer;
    return existing;
  }

  addEvidence(id: string, ev: Evidence) {
    const n = this.nodes.get(id);
    if (n && n.evidence.length < 25 && !n.evidence.some((e) => e.ref === ev.ref)) n.evidence.push(ev);
  }

  addEdge(source: string, target: string, kind: GraphEdge['kind'], confidence: Confidence = 'confirmed', weight = 1) {
    if (source === target) return;
    const id = `${kind}:${source}->${target}`;
    const existing = this.edges.get(id);
    if (existing) {
      existing.weight = (existing.weight ?? 1) + weight;
      if (RANK[confidence] > RANK[existing.confidence]) existing.confidence = confidence;
      return;
    }
    this.edges.set(id, { id, source, target, kind, confidence, weight });
  }

  has(id: string) {
    return this.nodes.has(id);
  }

  get(id: string) {
    return this.nodes.get(id);
  }

  removeWhere(pred: (n: GraphNode) => boolean) {
    for (const [id, n] of this.nodes) if (pred(n)) this.nodes.delete(id);
  }

  toArrays(): { nodes: GraphNode[]; edges: GraphEdge[] } {
    const nodes = [...this.nodes.values()];
    const edges = [...this.edges.values()].filter((e) => this.nodes.has(e.source) && this.nodes.has(e.target));
    return { nodes, edges };
  }
}

function dedupeEvidence(list: Evidence[]): Evidence[] {
  const seen = new Set<string>();
  return list.filter((e) => {
    const k = `${e.type}|${e.ref}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
