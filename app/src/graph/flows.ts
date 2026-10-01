import type { Analysis, Confidence, GraphEdge, GraphNode, Layer } from '../core/model';
import { basename } from '../lib/util';

/**
 * Turns an Analysis into request traces for the Dots view: ordered hops between
 * "stations" (browser, edge, handler, services, ORM, database, cache, queue,
 * external APIs). Traces follow the real import graph and detected SDK usage;
 * anything not directly observed is marked inferred.
 */

export type StationKind =
  | 'client' | 'component' | 'dns' | 'edge' | 'origin' | 'handler' | 'service' | 'repository'
  | 'orm' | 'db' | 'cache' | 'queue' | 'external' | 'thirdparty' | 'bundle';

export interface Station {
  id: string;
  kind: StationKind;
  label: string;
  sub: string;
  layer: Layer;
  /** Analysis node to open in the detail panel */
  nodeId: string | null;
  confidence: Confidence;
}

export interface Hop {
  from: string;
  to: string;
  label: string;
  detail: string;
  direction: 'request' | 'response';
  confidence: Confidence;
  /** file:line or header that justifies this hop */
  evidence?: string;
  nodeId?: string | null;
}

export interface Scenario {
  id: string;
  title: string;
  subtitle: string;
  method?: string;
  group: string;
  stations: Station[];
  hops: Hop[];
}

const KIND_LAYER: Record<StationKind, Layer> = {
  client: 'frontend', component: 'frontend', bundle: 'frontend', dns: 'infra', edge: 'infra', origin: 'service',
  handler: 'api', service: 'service', repository: 'data', orm: 'data', db: 'data', cache: 'data', queue: 'data',
  external: 'external', thirdparty: 'external',
};

interface Ctx {
  a: Analysis;
  byId: Map<string, GraphNode>;
  out: Map<string, GraphEdge[]>;
  inn: Map<string, GraphEdge[]>;
}

function context(a: Analysis): Ctx {
  const byId = new Map(a.nodes.map((n) => [n.id, n]));
  const out = new Map<string, GraphEdge[]>();
  const inn = new Map<string, GraphEdge[]>();
  for (const e of a.edges) {
    if (!out.has(e.source)) out.set(e.source, []);
    out.get(e.source)!.push(e);
    if (!inn.has(e.target)) inn.set(e.target, []);
    inn.get(e.target)!.push(e);
  }
  return { a, byId, out, inn };
}

function storeKind(n: GraphNode): StationKind {
  const s = `${n.label} ${n.meta.category ?? ''}`;
  if (/queue|broker|kafka|rabbit|event stream|job/i.test(s)) return 'queue';
  if (/redis|memcache|cache|kv/i.test(s)) return 'cache';
  return 'db';
}

/** Small builder that keeps stations unique and hops ordered. */
class Trace {
  stations = new Map<string, Station>();
  hops: Hop[] = [];
  station(s: Omit<Station, 'layer'> & { layer?: Layer }): string {
    if (!this.stations.has(s.id)) this.stations.set(s.id, { ...s, layer: s.layer ?? KIND_LAYER[s.kind] });
    return s.id;
  }
  hop(h: Hop) {
    this.hops.push(h);
  }
  /** mirror every request hop back as a response, in reverse order */
  respond(labelFor: (from: Station, to: Station) => string) {
    const req = this.hops.filter((h) => h.direction === 'request' && !h.label.startsWith('↺'));
    // walk back along the main chain only (skip side trips that already returned)
    const chain: Hop[] = [];
    const returned = new Set(this.hops.filter((h) => h.direction === 'response').map((h) => `${h.to}->${h.from}`));
    for (const h of req) if (!returned.has(`${h.from}->${h.to}`)) chain.push(h);
    for (const h of chain.reverse()) {
      this.hops.push({ from: h.to, to: h.from, label: labelFor(this.stations.get(h.to)!, this.stations.get(h.from)!), detail: 'response', direction: 'response', confidence: h.confidence });
    }
  }
}

function evidenceFor(node: GraphNode | undefined, file?: string): string | undefined {
  if (!node) return undefined;
  const ev = (file && node.evidence.find((e) => e.ref.startsWith(file + ':'))) || node.evidence[0];
  return ev ? `${ev.ref}${ev.snippet ? ` — ${ev.snippet}` : ''}` : undefined;
}

// ── Repo mode ────────────────────────────────────────────────────────────────

function hostingStation(c: Ctx): GraphNode | undefined {
  const infra = c.a.nodes.filter((n) => n.kind === 'infra');
  return (
    infra.find((n) => /Hosting|CDN|Edge runtime|Functions/.test(String(n.meta.category))) ??
    infra.find((n) => /Deploy target/.test(String(n.meta.category))) ??
    infra.find((n) => n.label === 'Docker' || n.label === 'Docker Compose')
  );
}

/** Files reachable from the handler through imports (BFS), preferring service/data layers. */
function downstreamFiles(c: Ctx, start: string, maxDepth = 3, limit = 3): { file: GraphNode; depth: number; via: string }[] {
  const seen = new Set([start]);
  let frontier = [start];
  const found: { file: GraphNode; depth: number; via: string }[] = [];
  for (let depth = 1; depth <= maxDepth && frontier.length; depth++) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const e of c.out.get(id) ?? []) {
        if (e.kind !== 'imports' || seen.has(e.target)) continue;
        seen.add(e.target);
        const n = c.byId.get(e.target);
        if (!n || n.kind !== 'file') continue;
        next.push(e.target);
        const touchesData = (c.out.get(e.target) ?? []).some((x) => x.target.startsWith('store:') || x.target.startsWith('svc:') || x.kind === 'readsWrites');
        if ((n.layer === 'service' || n.layer === 'data' || touchesData) && !/(^|\/)(types?|constants?|utils?|config|errors?|schemas?)\.[a-z]+$/i.test(String(n.meta.path))) {
          found.push({ file: n, depth, via: id });
        }
      }
    }
    frontier = next;
  }
  // most data-relevant first, then shallow
  return found
    .sort((x, y) => Number((c.out.get(y.file.id) ?? []).some((e) => e.kind === 'readsWrites')) - Number((c.out.get(x.file.id) ?? []).some((e) => e.kind === 'readsWrites')) || x.depth - y.depth)
    .slice(0, limit)
    .sort((x, y) => x.depth - y.depth);
}

function repoScenario(c: Ctx, ep: GraphNode): Scenario {
  const t = new Trace();
  const method = String(ep.meta.method);
  const path = String(ep.meta.path);
  const handlerFile = c.byId.get(`file:${ep.meta.file}`);

  // 1. who calls it
  const caller = (c.inn.get(ep.id) ?? []).find((e) => e.kind === 'calls' && c.byId.get(e.source)?.kind === 'file');
  const client = t.station({ id: 'client', kind: 'client', label: 'Browser', sub: 'user / HTTP client', nodeId: null, confidence: 'inferred' });
  let prev = client;
  if (caller) {
    const comp = c.byId.get(caller.source)!;
    const id = t.station({ id: comp.id, kind: 'component', label: comp.label, sub: String(comp.meta.path), nodeId: comp.id, confidence: 'confirmed' });
    t.hop({ from: client, to: id, label: 'user interaction', detail: 'Component renders and triggers the request', direction: 'request', confidence: 'inferred', nodeId: comp.id });
    prev = id;
  }

  // 2. edge / host
  const host = hostingStation(c);
  if (host) {
    const id = t.station({ id: host.id, kind: 'edge', label: host.label, sub: String(host.meta.category ?? 'hosting'), nodeId: host.id, confidence: host.confidence });
    t.hop({ from: prev, to: id, label: `HTTPS ${method === 'ANY' ? 'request' : method} ${path}`, detail: caller ? `fetch/axios call in ${basename(caller.source)}` : 'Incoming request', direction: 'request', confidence: caller ? 'likely' : 'inferred', evidence: evidenceFor(host), nodeId: host.id });
    prev = id;
  }

  // 3. handler
  const handler = t.station({
    id: ep.id, kind: 'handler', label: `${method} ${path}`,
    sub: `${ep.meta.handler ? `${ep.meta.handler} · ` : ''}${String(ep.meta.file ?? '').split('/').slice(-2).join('/')}${ep.meta.line ? `:${ep.meta.line}` : ''}`,
    nodeId: ep.id, confidence: ep.confidence,
  });
  t.hop({ from: prev, to: handler, label: host ? `route → ${String(ep.meta.framework)}` : `${method} ${path}`, detail: `Matched by ${ep.meta.framework}`, direction: 'request', confidence: ep.confidence, evidence: evidenceFor(ep), nodeId: ep.id });

  // 4–5. depth-first walk of the real import tree: each service is called from the
  // file that imports it, does its own data work, and returns before the next one.
  const chosen = handlerFile ? downstreamFiles(c, handlerFile.id, 3, 4) : [];
  const chosenIds = new Set(chosen.map((x) => x.file.id));
  const children = new Map<string, GraphNode[]>();
  for (const { file, via } of chosen) {
    const parent = chosenIds.has(via) ? via : handlerFile!.id;
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent)!.push(file);
  }
  const dbs = c.a.nodes.filter((n) => n.kind === 'datastore' && storeKind(n) === 'db');
  const shown = new Set<string>();
  const verb = method === 'GET' ? 'SELECT' : method === 'DELETE' ? 'DELETE' : method === 'POST' ? 'INSERT' : method === 'PUT' || method === 'PATCH' ? 'UPDATE' : 'query';
  const st = (n: GraphNode, conf: Confidence = n.confidence) =>
    t.station({ id: n.id, kind: n.kind === 'framework' ? 'orm' : storeKind(n), label: n.label, sub: String(n.meta.category ?? ''), nodeId: n.id, confidence: conf });

  /** ORM / database / cache / queue / external API side trips made by one file. */
  const dataTrips = (fileId: string, from: string) => {
    const filePath = String(c.byId.get(fileId)?.meta.path ?? '');
    const touched: GraphNode[] = [];
    for (const e of c.out.get(fileId) ?? []) {
      const n = c.byId.get(e.target);
      if (n && !shown.has(n.id) && (n.kind === 'datastore' || n.kind === 'service' || (n.kind === 'framework' && n.layer === 'data'))) touched.push(n);
    }
    const orm = touched.find((n) => n.kind === 'framework');
    const stores = touched.filter((n) => n.kind === 'datastore');
    if (orm) {
      const target = (c.out.get(orm.id) ?? []).map((e) => c.byId.get(e.target)).find((n) => n?.kind === 'datastore') ?? (dbs.length === 1 ? dbs[0] : undefined);
      if (target && !stores.includes(target) && !shown.has(target.id)) stores.push(target);
    }
    const cache = stores.find((n) => storeKind(n) === 'cache');
    const db = stores.find((n) => storeKind(n) === 'db');
    const queue = stores.find((n) => storeKind(n) === 'queue');
    if (cache) {
      shown.add(cache.id);
      const cid = st(cache);
      t.hop({ from, to: cid, label: 'GET cache key', detail: `Cache lookup via ${cache.label}`, direction: 'request', confidence: 'likely', evidence: evidenceFor(cache, filePath), nodeId: cache.id });
      t.hop({ from: cid, to: from, label: db ? 'miss' : 'hit / miss', detail: 'On a miss the code falls through to the database', direction: 'response', confidence: 'inferred' });
    }
    if (db || orm) {
      let dbFrom = from;
      if (orm) {
        shown.add(orm.id);
        dbFrom = st(orm);
        t.hop({ from, to: dbFrom, label: `${orm.label} query`, detail: `Query built with ${orm.label} in ${basename(filePath)}`, direction: 'request', confidence: 'confirmed', evidence: evidenceFor(orm, filePath), nodeId: orm.id });
      }
      if (db) {
        shown.add(db.id);
        const did = st(db);
        const sql = /SQL|Postgre|MySQL|SQLite|Cockroach/i.test(`${db.label} ${db.meta.category}`);
        t.hop({ from: dbFrom, to: did, label: sql ? `${verb} …` : `${db.label} ${verb === 'SELECT' ? 'read' : 'write'}`, detail: `Reaches ${db.label}`, direction: 'request', confidence: 'likely', evidence: evidenceFor(db, filePath), nodeId: db.id });
        t.hop({ from: did, to: dbFrom, label: method === 'GET' ? 'rows' : 'ok', detail: 'Result set', direction: 'response', confidence: 'likely' });
      }
      if (orm) t.hop({ from: dbFrom, to: from, label: 'models', detail: 'ORM maps rows to objects', direction: 'response', confidence: 'likely' });
      if (cache && db) t.hop({ from, to: cache.id, label: '↺ SET cache key', detail: 'Populate the cache for next time', direction: 'request', confidence: 'inferred' });
    }
    if (queue) {
      shown.add(queue.id);
      const qid = st(queue);
      t.hop({ from, to: qid, label: 'enqueue job', detail: `Background work via ${queue.label}`, direction: 'request', confidence: 'likely', evidence: evidenceFor(queue, filePath), nodeId: queue.id });
      t.hop({ from: qid, to: from, label: 'ack', detail: 'Accepted for async processing', direction: 'response', confidence: 'inferred' });
    }
    for (const x of touched.filter((n) => n.kind === 'service').slice(0, 2)) {
      shown.add(x.id);
      const id = t.station({ id: x.id, kind: 'external', label: x.label, sub: String(x.meta.category ?? 'external API'), nodeId: x.id, confidence: x.confidence });
      t.hop({ from, to: id, label: `${x.label} API call`, detail: `SDK imported in ${filePath}`, direction: 'request', confidence: 'likely', evidence: evidenceFor(x, filePath), nodeId: x.id });
      t.hop({ from: id, to: from, label: 'response', detail: `${x.label} replies`, direction: 'response', confidence: 'inferred' });
    }
  };

  // Writes must persist somewhere: if nothing on this path imports a driver/ORM, show the
  // repo's database from the deepest data-ish file on the path, clearly marked inferred.
  const pathFiles = [handlerFile?.id, ...chosen.map((x) => x.file.id)].filter(Boolean) as string[];
  const touchesData = pathFiles.some((f) => (c.out.get(f) ?? []).some((e) => { const n = c.byId.get(e.target); return n && (n.kind === 'datastore' || n.kind === 'service' || (n.kind === 'framework' && n.layer === 'data')); }));
  const inferDb = !touchesData && dbs.length > 0 && method !== 'GET' && method !== 'PAGE'
    ? ([...chosen].reverse().find((x) => x.file.layer === 'data')?.file.id ?? chosen[chosen.length - 1]?.file.id ?? handlerFile?.id ?? null)
    : null;

  const visit = (fileId: string, stationId: string, depth: number) => {
    dataTrips(fileId, stationId);
    if (fileId === inferDb) {
      const db = dbs[0];
      const did = st(db, 'inferred');
      t.hop({ from: stationId, to: did, label: `${verb} …`, detail: 'Inferred: the repo has a database but no driver import was found on this path', direction: 'request', confidence: 'inferred', nodeId: db.id });
      t.hop({ from: did, to: stationId, label: 'ok', detail: 'Result', direction: 'response', confidence: 'inferred' });
    }
    for (const child of children.get(fileId) ?? []) {
      const kind: StationKind = child.layer === 'data' ? 'repository' : 'service';
      const id = t.station({ id: child.id, kind, label: basename(String(child.meta.path)).replace(/\.[a-z]+$/, ''), sub: String(child.meta.path), nodeId: child.id, confidence: 'confirmed' });
      t.hop({ from: stationId, to: id, label: `calls ${basename(String(child.meta.path))}`, detail: `Imported by ${basename(String(c.byId.get(fileId)?.meta.path ?? ''))}`, direction: 'request', confidence: 'confirmed', nodeId: child.id });
      if (depth < 4) visit(child.id, id, depth + 1);
      t.hop({ from: id, to: stationId, label: 'return', detail: 'Result handed back to the caller', direction: 'response', confidence: 'confirmed' });
    }
  };
  if (handlerFile) visit(handlerFile.id, handler, 0);

  // 6. response back to the client along the main chain
  const status = method === 'POST' ? '201 Created' : method === 'DELETE' ? '204 No Content' : method === 'QUERY' || method === 'MUTATION' ? '200 { data }' : '200 OK';
  t.respond((from, to) => (to.kind === 'client' ? 'rendered response' : to.kind === 'component' ? 'update UI' : from.kind === 'handler' ? status : 'return'));

  return {
    id: ep.id,
    title: `${method} ${path}`,
    subtitle: String(ep.meta.file ?? ''),
    method,
    group: String(ep.meta.framework ?? 'Endpoints'),
    stations: [...t.stations.values()],
    hops: t.hops,
  };
}

function repoPageScenario(c: Ctx, pages: GraphNode[]): Scenario {
  const t = new Trace();
  const page = pages.find((p) => String(p.meta.path) === '/') ?? pages[0];
  const client = t.station({ id: 'client', kind: 'client', label: 'Browser', sub: 'navigates', nodeId: null, confidence: 'inferred' });
  let prev = client;
  const host = hostingStation(c);
  if (host) {
    prev = t.station({ id: host.id, kind: 'edge', label: host.label, sub: String(host.meta.category ?? ''), nodeId: host.id, confidence: host.confidence });
    t.hop({ from: client, to: prev, label: `GET ${page.meta.path}`, detail: 'Document request', direction: 'request', confidence: 'inferred', nodeId: host.id });
  }
  const pid = t.station({ id: page.id, kind: 'component', label: `page ${page.meta.path}`, sub: String(page.meta.file ?? ''), nodeId: page.id, confidence: page.confidence });
  t.hop({ from: prev, to: pid, label: `render ${page.meta.path}`, detail: String(page.meta.framework ?? ''), direction: 'request', confidence: page.confidence, evidence: evidenceFor(page), nodeId: page.id });
  // data the page component (or its imports) fetches
  const pageFile = `file:${page.meta.file}`;
  const fetched = new Set<string>();
  for (const f of [pageFile, ...(c.out.get(pageFile) ?? []).filter((e) => e.kind === 'imports').map((e) => e.target)]) {
    for (const e of c.out.get(f) ?? []) if (e.kind === 'calls' && e.target.startsWith('endpoint:')) fetched.add(e.target);
  }
  for (const epId of [...fetched].slice(0, 2)) {
    const ep = c.byId.get(epId)!;
    const id = t.station({ id: ep.id, kind: 'handler', label: ep.label, sub: String(ep.meta.file ?? ''), nodeId: ep.id, confidence: ep.confidence });
    t.hop({ from: pid, to: id, label: `fetch ${ep.meta.path}`, detail: 'Data fetching from the page', direction: 'request', confidence: 'likely', nodeId: ep.id });
    t.hop({ from: id, to: pid, label: 'JSON', detail: 'API response', direction: 'response', confidence: 'likely' });
  }
  t.respond((_f, to) => (to.kind === 'client' ? 'HTML + JS' : 'stream'));
  return { id: `page:${page.id}`, title: `Page load ${page.meta.path}`, subtitle: `${pages.length} pages detected`, method: 'PAGE', group: 'Pages', stations: [...t.stations.values()], hops: t.hops };
}

// ── URL mode ────────────────────────────────────────────────────────────────

function urlScenarios(c: Ctx): Scenario[] {
  const out: Scenario[] = [];
  const site = c.a.nodes.find((n) => n.kind === 'module');
  if (!site) return out;
  const infra = c.a.nodes.filter((n) => n.kind === 'infra');
  const dnsProv = infra.find((n) => n.meta.category === 'DNS provider');
  const cdn = infra.find((n) => /CDN|Hosting|Static hosting|Edge/.test(String(n.meta.category)));
  const server = infra.find((n) => /Web server|Proxy|Load balancer/.test(String(n.meta.category)));
  const backend = c.byId.get('svc:origin-backend');
  const fws = c.a.nodes.filter((n) => n.kind === 'framework' && n.layer === 'frontend');

  // page load
  {
    const t = new Trace();
    const client = t.station({ id: 'client', kind: 'client', label: 'Browser', sub: 'first visit', nodeId: null, confidence: 'inferred' });
    let prev = client;
    if (dnsProv || c.a.context.dns?.A) {
      const id = t.station({ id: dnsProv?.id ?? 'dns', kind: 'dns', label: dnsProv?.label ?? 'DNS', sub: (c.a.context.dns?.A ?? []).slice(0, 2).join(', ') || 'resolver', nodeId: dnsProv?.id ?? null, confidence: 'confirmed' });
      t.hop({ from: client, to: id, label: `resolve ${site.label}`, detail: 'DNS lookup (A/AAAA)', direction: 'request', confidence: 'confirmed', evidence: c.a.context.dns?.A ? `A ${c.a.context.dns.A.join(', ')}` : undefined, nodeId: dnsProv?.id ?? null });
      t.hop({ from: id, to: client, label: 'IP address', detail: 'Resolved', direction: 'response', confidence: 'confirmed' });
    }
    if (cdn) {
      prev = t.station({ id: cdn.id, kind: 'edge', label: cdn.label, sub: String(cdn.meta.category), nodeId: cdn.id, confidence: cdn.confidence });
      t.hop({ from: client, to: prev, label: 'GET / (TLS)', detail: 'Request hits the edge first', direction: 'request', confidence: 'confirmed', evidence: evidenceFor(cdn), nodeId: cdn.id });
      const cacheHdr = Object.entries(c.a.context.headers ?? {}).find(([k]) => /x-vercel-cache|cf-cache-status|x-cache|x-nextjs-cache/.test(k));
      if (cacheHdr && /HIT/i.test(cacheHdr[1])) {
        t.hop({ from: prev, to: client, label: `cache HIT (${cacheHdr[0]})`, detail: 'The edge served this page from cache; the origin was not involved', direction: 'response', confidence: 'confirmed', evidence: `${cacheHdr[0]}: ${cacheHdr[1]}` });
      }
    }
    if (server) {
      const id = t.station({ id: server.id, kind: 'edge', label: server.label, sub: String(server.meta.category), nodeId: server.id, confidence: server.confidence });
      t.hop({ from: prev, to: id, label: 'proxy pass', detail: 'Reverse proxy / web server', direction: 'request', confidence: 'likely', evidence: evidenceFor(server), nodeId: server.id });
      prev = id;
    }
    if (backend && !(t.hops.length && t.hops[t.hops.length - 1].label.startsWith('cache HIT'))) {
      const id = t.station({ id: backend.id, kind: 'origin', label: backend.label, sub: 'origin (not visible from outside)', nodeId: backend.id, confidence: backend.confidence });
      t.hop({ from: prev, to: id, label: 'origin request', detail: String(c.a.context.url?.rendering ?? 'render HTML'), direction: 'request', confidence: 'inferred', nodeId: backend.id });
      t.hop({ from: id, to: prev, label: `HTML (${c.a.context.url?.status ?? 200})`, detail: String(c.a.context.url?.rendering ?? ''), direction: 'response', confidence: 'likely' });
      if (prev !== client) t.hop({ from: prev, to: client, label: 'HTML', detail: 'Document delivered', direction: 'response', confidence: 'confirmed' });
    }
    // hydrate
    const fw = fws[0];
    if (fw) {
      const id = t.station({ id: fw.id, kind: 'bundle', label: fw.label, sub: 'JS bundles · hydration', nodeId: fw.id, confidence: fw.confidence });
      t.hop({ from: client, to: id, label: 'load JS + hydrate', detail: `${c.a.summary.counts.scripts ?? 0} scripts`, direction: 'request', confidence: 'confirmed', evidence: evidenceFor(fw), nodeId: fw.id });
      t.hop({ from: id, to: client, label: 'interactive', detail: 'Page becomes interactive', direction: 'response', confidence: 'likely' });
    }
    out.push({ id: 'url:pageload', title: 'Page load', subtitle: site.label, method: 'PAGE', group: 'Page', stations: [...t.stations.values()], hops: t.hops });
  }

  // API calls the bundles make
  const apis = c.a.nodes.filter((n) => n.kind === 'service' && (n.layer === 'api' || n.id === 'svc:same-origin-api'));
  for (const api of apis.slice(0, 8)) {
    const t = new Trace();
    const client = t.station({ id: 'client', kind: 'client', label: 'Browser', sub: 'running app', nodeId: null, confidence: 'inferred' });
    const id = t.station({ id: api.id, kind: 'handler', label: api.label, sub: String(api.meta.category ?? 'API'), nodeId: api.id, confidence: api.confidence });
    t.hop({ from: client, to: id, label: 'fetch()', detail: api.evidence[0]?.snippet ?? 'Found in a JS bundle', direction: 'request', confidence: 'likely', evidence: evidenceFor(api), nodeId: api.id });
    if (backend) {
      const b = t.station({ id: backend.id, kind: 'origin', label: 'Backend', sub: 'inferred', nodeId: backend.id, confidence: 'inferred' });
      t.hop({ from: id, to: b, label: 'handle', detail: 'Server-side logic is not visible from outside', direction: 'request', confidence: 'inferred' });
    }
    const baas = c.a.nodes.find((n) => n.kind === 'service' && n.layer === 'data');
    if (baas) {
      const d = t.station({ id: baas.id, kind: 'db', label: baas.label, sub: String(baas.meta.category), nodeId: baas.id, confidence: baas.confidence });
      t.hop({ from: backend ? backend.id : id, to: d, label: 'query', detail: `${baas.label} detected in bundles`, direction: 'request', confidence: 'inferred', nodeId: baas.id });
    }
    t.respond((_f, to) => (to.kind === 'client' ? 'JSON' : 'result'));
    out.push({ id: `url:api:${api.id}`, title: `API ${api.label}`, subtitle: 'called from the bundle', group: 'API calls', stations: [...t.stations.values()], hops: t.hops });
  }

  // analytics / tracking beacons
  const trackers = c.a.nodes.filter((n) => n.kind === 'thirdParty' && /Analytics|Advertising|Monitoring|Error tracking|Marketing/.test(String(n.meta.category)));
  if (trackers.length) {
    const t = new Trace();
    const client = t.station({ id: 'client', kind: 'client', label: 'Browser', sub: 'after load', nodeId: null, confidence: 'inferred' });
    for (const tr of trackers.slice(0, 6)) {
      const id = t.station({ id: tr.id, kind: 'thirdparty', label: tr.label, sub: String(tr.meta.category), nodeId: tr.id, confidence: tr.confidence });
      t.hop({ from: client, to: id, label: 'beacon', detail: `${tr.meta.category} script sends events`, direction: 'request', confidence: 'likely', evidence: evidenceFor(tr), nodeId: tr.id });
      t.hop({ from: id, to: client, label: '204', detail: 'Ack', direction: 'response', confidence: 'inferred' });
    }
    out.push({ id: 'url:beacons', title: 'Tracking beacons', subtitle: `${trackers.length} analytics / ads / monitoring services`, group: 'Third parties', stations: [...t.stations.values()], hops: t.hops });
  }
  return out;
}

export function buildScenarios(a: Analysis): Scenario[] {
  const c = context(a);
  if (a.mode === 'url') return urlScenarios(c);
  const endpoints = a.nodes.filter((n) => n.kind === 'endpoint');
  const api = endpoints.filter((n) => n.meta.method !== 'PAGE');
  const pages = endpoints.filter((n) => n.meta.method === 'PAGE');
  // richest traces first: those that reach data/external stations
  const scenarios = api.slice(0, 400).map((ep) => repoScenario(c, ep));
  scenarios.sort((x, y) => y.stations.length - x.stations.length);
  if (pages.length) scenarios.unshift(repoPageScenario(c, pages));
  return scenarios;
}

/** Aggregate "traffic" scenario set for ambient mode: random weighted picks. */
export function pickWeighted(scenarios: Scenario[], rand = Math.random): Scenario {
  const total = scenarios.reduce((s, x) => s + x.stations.length, 0);
  let r = rand() * total;
  for (const s of scenarios) {
    r -= s.stations.length;
    if (r <= 0) return s;
  }
  return scenarios[0];
}
