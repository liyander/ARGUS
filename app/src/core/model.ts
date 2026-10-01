/**
 * The unified data model. Both repo mode and URL mode emit an `Analysis`,
 * so every view works for both. Keep this file dependency-free: it is shared
 * by the browser app, the Web Workers and the Node showcase script.
 */

export type Confidence = 'confirmed' | 'likely' | 'inferred';

export type NodeKind =
  | 'file'
  | 'module'
  | 'layer'
  | 'endpoint'
  | 'dependency'
  | 'framework'
  | 'service'
  | 'datastore'
  | 'thirdParty'
  | 'infra';

export type Layer = 'frontend' | 'api' | 'service' | 'data' | 'infra' | 'external';

export const LAYERS: Layer[] = ['frontend', 'api', 'service', 'data', 'infra', 'external'];

export interface Evidence {
  type: 'file' | 'header' | 'html' | 'script' | 'dns' | 'manifest';
  /** file path (+ `:line`), header name, or URL */
  ref: string;
  snippet?: string;
}

export interface GraphNode {
  /** stable, e.g. 'file:src/api/users.ts' */
  id: string;
  kind: NodeKind;
  label: string;
  layer?: Layer;
  confidence: Confidence;
  /** version, license, LOC, method, path... */
  meta: Record<string, unknown>;
  /** why we believe this */
  evidence: Evidence[];
}

export type EdgeKind = 'imports' | 'calls' | 'handles' | 'dependsOn' | 'servesFrom' | 'readsWrites';

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  kind: EdgeKind;
  confidence: Confidence;
  /** aggregated edges (module → module) carry how many file edges they stand for */
  weight?: number;
}

export interface HealthFactor {
  label: string;
  /** 0..100 */
  score: number;
  weight: number;
  detail: string;
}

export interface HealthScore {
  score: number;
  grade: string;
  factors: HealthFactor[];
}

export interface TreeEntry {
  path: string;
  size: number;
}

export interface RepoInfo {
  owner: string;
  name: string;
  fullName: string;
  description: string | null;
  stars: number;
  forks: number;
  defaultBranch: string;
  ref: string;
  /** folder scope, e.g. 'packages/core' ('' = whole repo) */
  subPath: string;
  license: string | null;
  topics: string[];
  sizeKb: number;
  pushedAt: string | null;
  avatarUrl: string | null;
  homepage: string | null;
  language: string | null;
}

export interface UrlInfo {
  input: string;
  finalUrl: string;
  status: number;
  redirects: string[];
  title: string | null;
  rendering: string | null;
  githubRepo: string | null;
}

export interface Analysis {
  id: string;
  mode: 'repo' | 'url';
  target: string;
  createdAt: string;
  summary: { stack: string[]; counts: Record<string, number>; health: HealthScore };
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** partial analysis, rate limited, skipped files */
  warnings: string[];
  /** Mode-specific context the views need (not part of the graph itself). */
  context: {
    repo?: RepoInfo;
    sha?: string;
    /** every path in the tree, downloaded or not — drives the treemap */
    tree?: TreeEntry[];
    languages?: Record<string, number>;
    url?: UrlInfo;
    /** URL mode: raw header map, for the header card */
    headers?: Record<string, string>;
    securityHeaders?: { name: string; present: boolean; value?: string; advice: string }[];
    dns?: Record<string, string[]>;
    stats?: { filesInTree: number; filesAnalyzed: number; bytesDownloaded: number; durationMs: number };
  };
}

export type LogLevel = 'info' | 'success' | 'warn' | 'error' | 'step';

export interface LogLine {
  t: number;
  level: LogLevel;
  text: string;
}

export interface PipelineCallbacks {
  log: (level: LogLevel, text: string) => void;
  /** called whenever the analysis grew; views re-render from it */
  update: (analysis: Analysis) => void;
  /** 0..1 */
  progress?: (fraction: number, label: string) => void;
  signal?: AbortSignal;
}

export const emptyHealth = (): HealthScore => ({ score: 0, grade: '–', factors: [] });

export function newAnalysis(mode: Analysis['mode'], target: string): Analysis {
  return {
    id: `${mode}:${target}`,
    mode,
    target,
    createdAt: new Date().toISOString(),
    summary: { stack: [], counts: {}, health: emptyHealth() },
    nodes: [],
    edges: [],
    warnings: [],
    context: {},
  };
}
