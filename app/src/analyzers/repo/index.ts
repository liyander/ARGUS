import { contentKey, rememberContent } from '../../core/content';
import { GraphBuilder } from '../../core/graph';
import { grade, repoHealth } from '../../core/health';
import { LAYERS, newAnalysis, type Analysis, type Evidence, type GraphNode, type Layer, type PipelineCallbacks, type TreeEntry } from '../../core/model';
import type { ParseBackend } from '../../core/parsers';
import { fetchRaw, fetchRepoInfo, fetchTree, GithubError, lastApiSource, parseRepoInput, rawStats, resetRawStats } from '../../sources/github';
import { basename, chunk, dirname, extname, formatBytes, formatNumber, pool, uniq } from '../../lib/util';
import { lookupPackage, type CatalogEntry } from './catalog';
import { classifyFile, inferLayerFromPath, moduleOf, PARSEABLE_EXT, type ClassifiedFile } from './classify';
import { coerceVersion, enrichDependencies, majorOf, rangeAdmits, type DepQuery } from './enrich';
import { joinRoute, type FileFacts, type RouteFact } from './facts';
import { ImportResolver } from './imports/resolve';
import { analyzeCompose, analyzeDockerfile, analyzeHostConfig, type InfraFinding } from './infra/docker';
import { analyzeWorkflow } from './infra/workflows';
import { extractFileRoutes, type FrameworkRoots } from './routes/nextjs';
import { parseManifest, type DeclaredDep, type ManifestResult } from './stack';

export interface RepoPipelineOptions {
  backend: ParseBackend;
  fileBudget?: number;
  byteBudget?: number;
  enrich?: boolean;
  concurrency?: number;
}

export async function runRepoPipeline(input: string, opts: RepoPipelineOptions, cb: PipelineCallbacks): Promise<Analysis> {
  const t0 = performance.now();
  resetRawStats();
  const { signal } = cb;
  const fileBudget = opts.fileBudget ?? 1500;
  const byteBudget = opts.byteBudget ?? 30 * 1024 * 1024;
  const concurrency = opts.concurrency ?? 16;

  // ── 1. Parse input
  const ref = parseRepoInput(input);
  if (!ref) throw new GithubError(`"${input}" is not a GitHub repository. Try owner/repo or a github.com URL.`, 400);
  const target = `${ref.owner}/${ref.repo}${ref.subPath ? `/${ref.subPath}` : ''}`;
  const analysis = newAnalysis('repo', target);
  const g = new GraphBuilder();
  let lastEmit = 0;
  const emit = (force = false) => {
    const now = performance.now();
    if (!force && now - lastEmit < 250) return;
    lastEmit = now;
    const { nodes, edges } = g.toArrays();
    cb.update({ ...analysis, nodes, edges, summary: { ...analysis.summary }, context: { ...analysis.context } });
  };
  cb.log('step', `Resolving github.com/${ref.owner}/${ref.repo}${ref.ref ? ` @ ${ref.ref}` : ''}${ref.subPath ? ` → ${ref.subPath}/` : ''}`);

  // ── 2. Metadata (API call 1)
  const repo = await fetchRepoInfo(ref, signal);
  analysis.context.repo = repo;
  const via = { token: 'your token', proxy: 'Stackscope GitHub proxy', direct: 'GitHub API', fallback: 'ungh.cc mirror (GitHub API rate-limited)', minimal: 'jsDelivr only (GitHub API and mirror busy)' }[lastApiSource];
  cb.log('success', `${repo.fullName}${repo.stars >= 0 ? ` · ★ ${formatNumber(repo.stars)}` : ''} · ${repo.license ?? 'license n/a'} · branch ${repo.ref} · via ${via}`);
  if (lastApiSource === 'fallback' || lastApiSource === 'minimal') {
    analysis.warnings.push(
      lastApiSource === 'fallback'
        ? 'GitHub API was rate-limited, so metadata came from the ungh.cc mirror and the file list from jsDelivr. License and topics are unavailable for this scan.'
        : 'GitHub API and its public mirror were both busy, so this scan used jsDelivr only: stars, description, license and topics are unavailable. Re-scan later for full metadata.',
    );
  }
  cb.progress?.(0.08, 'Metadata');
  emit(true);

  // ── 3. Tree (API call 2)
  let tree = await fetchTree(repo.owner, repo.name, repo.ref, signal);
  analysis.context.sha = tree.sha;
  const scope = ref.subPath ? ref.subPath.replace(/\/$/, '') + '/' : '';
  let scoped = scope ? tree.files.filter((f) => f.path.startsWith(scope)) : tree.files;
  if (scope && tree.truncated && scoped.length < 50) {
    // huge repo: the recursive tree was cut off before our folder — fetch just the subtree (one extra call)
    cb.log('info', `Tree truncated; fetching ${ref.subPath}/ directly`);
    const sub = await fetchTree(repo.owner, repo.name, `${repo.ref}:${ref.subPath}`, signal);
    const files = sub.files.map((f) => ({ path: scope + f.path, size: f.size }));
    tree = { sha: repo.ref, truncated: sub.truncated, files: [...tree.files.filter((f) => !f.path.includes('/')), ...files] };
    analysis.context.sha = repo.ref;
    scoped = files;
  }
  if (scope && scoped.length === 0) throw new GithubError(`Folder "${ref.subPath}" not found on ${repo.ref}.`, 404);
  // root-level manifests/configs still matter when a folder is scoped
  const extraRoot = scope ? tree.files.filter((f) => !f.path.includes('/') && /^(package\.json|tsconfig\.json|go\.mod|pyproject\.toml|pnpm-workspace\.yaml)$/.test(f.path)) : [];
  analysis.context.tree = scoped.slice(0, 40000).map((f): TreeEntry => ({ path: f.path, size: f.size }));
  if (tree.truncated) analysis.warnings.push('GitHub truncated the file tree (repository has more than ~100,000 entries). Some folders are missing — analyze a subfolder for full detail.');
  const totalBytes = scoped.reduce((s, f) => s + f.size, 0);
  if (lastApiSource === 'fallback' || lastApiSource === 'minimal') cb.log('info', 'File list from jsDelivr (no GitHub API quota used)');
  cb.log('success', `Fetched tree: ${formatNumber(scoped.length)} files · ${formatBytes(totalBytes)} · commit ${tree.sha.slice(0, 7)}`);
  cb.progress?.(0.15, 'File tree');

  // ── 4. Classify
  const classified = [...scoped, ...extraRoot].map(classifyFile);
  const byRole = new Map<string, ClassifiedFile[]>();
  for (const f of classified) {
    if (!byRole.has(f.role)) byRole.set(f.role, []);
    byRole.get(f.role)!.push(f);
  }
  const role = (r: string) => byRole.get(r) ?? [];
  const languages: Record<string, number> = {};
  for (const f of classified) {
    if (!['source', 'test', 'data', 'infra'].includes(f.role) && !/\.(css|scss|less|html)$/.test(f.path)) continue;
    languages[f.language] = (languages[f.language] ?? 0) + f.size;
  }
  delete languages.Other;
  analysis.context.languages = languages;
  analysis.summary.counts = {
    files: scoped.length,
    sourceFiles: role('source').length,
    testFiles: role('test').length,
    manifests: role('manifest').length,
  };
  cb.log('info', `Classified: ${role('source').length} source · ${role('test').length} tests · ${role('manifest').length} manifests · ${role('infra').length} infra · ${role('data').length} data files`);
  emit(true);

  const allPaths = tree.files.map((f) => f.path);
  const resolver = new ImportResolver(allPaths);
  const download = async (path: string) => {
    const text = await fetchRaw(repo.owner, repo.name, tree.sha, path, signal);
    if (text !== null) {
      bytesDownloaded += text.length;
      rememberContent(contentKey(repo.owner, repo.name, tree.sha, path), text);
    }
    return text;
  };
  let bytesDownloaded = 0;

  // ── 5a. Manifests, configs and infra first
  const priorityFiles = [...role('manifest'), ...role('config').filter((f) => f.priority > 0), ...role('infra')]
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 250);
  const priorityContent = new Map<string, string>();
  await pool(priorityFiles, concurrency, async (f) => {
    const text = await download(f.path);
    if (text !== null) priorityContent.set(f.path, text);
  }, signal);
  cb.progress?.(0.25, 'Manifests');

  // ── 6. Stack detection
  const manifests: ManifestResult[] = [];
  for (const f of role('manifest')) {
    const text = priorityContent.get(f.path);
    if (!text) continue;
    const m = parseManifest(f.path, text);
    if (m) manifests.push(m);
  }
  for (const [path, text] of priorityContent) {
    if (/(^|\/)(t|j)sconfig(\.[\w-]+)?\.json$/.test(path)) resolver.addTsconfig(path, text);
  }
  for (const m of manifests) {
    if (m.ecosystem === 'npm') resolver.addWorkspacePackage(m.packageName ?? '', m.manifest);
    if (m.goModule) resolver.addGoModule(m.goModule, m.manifest, m.deps.map((d) => d.name));
    if (m.ecosystem === 'crates.io') resolver.addCrate(m.manifest);
  }
  const workspaceNames = new Set(manifests.map((m) => m.packageName).filter(Boolean) as string[]);

  // dependency nodes (merged across manifests)
  const depByKey = new Map<string, DeclaredDep[]>();
  for (const m of manifests) {
    for (const d of m.deps) {
      if (workspaceNames.has(d.name) || /^(workspace:|file:|link:)/.test(d.spec)) continue; // internal package
      const key = `dep:${d.ecosystem}:${d.name}`;
      if (!depByKey.has(key)) depByKey.set(key, []);
      depByKey.get(key)!.push(d);
    }
  }
  for (const [key, decls] of depByKey) {
    const first = decls.find((d) => !d.dev) ?? decls[0];
    g.addNode({
      id: key,
      kind: 'dependency',
      label: first.name,
      confidence: 'confirmed',
      meta: {
        ecosystem: first.ecosystem,
        spec: first.spec,
        version: coerceVersion(first.spec),
        dev: decls.every((d) => d.dev),
        manifests: uniq(decls.map((d) => d.manifest)),
        usedBy: 0,
      },
      evidence: decls.slice(0, 6).map((d) => ({ type: 'manifest' as const, ref: `${d.manifest}:${d.line}`, snippet: `"${d.name}": "${d.spec}"` })),
    });
  }

  // catalog nodes from declared deps
  const catalogNodeId = (e: CatalogEntry) =>
    e.kind === 'service' ? `svc:${e.name}` : e.kind === 'datastore' ? `store:${e.name}` : e.kind === 'infra' ? `infra:${e.name}` : `fw:${e.name}`;
  const addCatalogNode = (e: CatalogEntry, ev: Evidence, meta: Record<string, unknown> = {}, confidence: GraphNode['confidence'] = 'confirmed') =>
    g.addNode({
      id: catalogNodeId(e),
      kind: e.kind,
      label: e.name,
      layer: e.layer,
      confidence,
      meta: { category: e.category, logo: e.logo, ...meta },
      evidence: [ev],
    });
  for (const [key, decls] of depByKey) {
    const d = decls[0];
    const entry = lookupPackage(d.name);
    if (!entry) continue;
    const node = addCatalogNode(entry, { type: 'manifest', ref: `${d.manifest}:${d.line}`, snippet: `"${d.name}": "${d.spec}"` }, {
      version: entry.kind === 'framework' ? coerceVersion(d.spec) : undefined,
      packages: [d.name],
      dev: decls.every((x) => x.dev),
    });
    const pk = node.meta.packages as string[];
    if (!pk.includes(d.name)) pk.push(d.name);
    g.get(key)!.meta.catalog = node.id;
  }

  // framework roots for file-system routing
  const rootsFor = (pred: (deps: string[]) => boolean) =>
    manifests.filter((m) => m.ecosystem === 'npm' && pred(m.deps.map((d) => d.name))).map((m) => dirname(m.manifest));
  const fwRoots: FrameworkRoots = {
    next: rootsFor((d) => d.includes('next')),
    sveltekit: rootsFor((d) => d.includes('@sveltejs/kit')),
    nuxt: rootsFor((d) => d.includes('nuxt')),
    remix: rootsFor((d) => d.some((x) => x.startsWith('@remix-run/') || x === '@react-router/dev')),
  };
  if (fwRoots.next.length) {
    const appRouter = allPaths.some((p) => /(^|\/)app\/(.*\/)?(page|layout)\.(t|j)sx?$/.test(p));
    const next = g.get('fw:Next.js');
    if (next) next.meta.router = appRouter ? 'App Router' : 'Pages Router';
  }

  // infra
  const infraFindings: InfraFinding[] = [];
  for (const [path, text] of priorityContent) {
    const name = basename(path);
    if (name === 'Dockerfile' || name.startsWith('Dockerfile.') || name.endsWith('.dockerfile')) infraFindings.push(...analyzeDockerfile(path, text));
    else if (/^(docker-)?compose(\.[\w-]+)?\.ya?ml$/.test(name)) infraFindings.push(...analyzeCompose(path, text));
    else if (path.startsWith('.github/workflows/')) infraFindings.push(...analyzeWorkflow(path, text));
    else infraFindings.push(...analyzeHostConfig(path, text));
  }
  for (const f of infraFindings) {
    const id = f.kind === 'datastore' ? `store:${f.name}` : `infra:${f.name}`;
    const node = g.addNode({
      id, kind: f.kind, label: f.name, layer: f.kind === 'datastore' ? 'data' : 'infra', confidence: f.kind === 'datastore' ? 'likely' : 'confirmed',
      meta: { category: f.category, logo: f.logo, files: [] as string[] },
      evidence: [{ type: 'file', ref: `${f.file}:${f.line}`, snippet: f.snippet }],
    });
    const files = (node.meta.files as string[]) ?? (node.meta.files = []);
    if (!files.includes(f.file)) files.push(f.file);
    if (f.meta) {
      // merge array-valued meta (workflows, triggers, services)
      for (const [k, v] of Object.entries(f.meta)) {
        const prev = node.meta[k];
        node.meta[k] = Array.isArray(prev) && Array.isArray(v) ? uniq([...prev, ...v]) : prev ?? v;
      }
      if (f.name === 'GitHub Actions') {
        const wfs = (node.meta.workflowNames as string[]) ?? [];
        node.meta.workflowNames = uniq([...wfs, String(f.meta.workflow)]);
      }
    }
  }

  // primary languages as stack items
  const langTotal = Object.values(languages).reduce((a, b) => a + b, 0) || 1;
  const topLangs = Object.entries(languages).sort((a, b) => b[1] - a[1]).filter(([l, b]) => b / langTotal > 0.04 && !['JSON', 'YAML', 'Markdown', 'TOML', 'XML'].includes(l)).slice(0, 4);

  const fwNodes = [...g.nodes.values()].filter((n) => n.kind === 'framework' && !['Testing', 'Tooling', 'Build tool', 'Language', 'Monorepo', 'UI workshop'].includes(String(n.meta.category)));
  const fwNames = fwNodes.map((n) => `${n.label}${n.meta.version ? ` ${shortVersion(String(n.meta.version))}` : ''}${n.label === 'Next.js' && n.meta.router ? ` (${n.meta.router})` : ''}`);
  cb.log('success', `Parsed ${manifests.length} manifests → ${formatNumber(depByKey.size)} dependencies`);
  if (fwNames.length) cb.log('success', `Detected ${fwNames.slice(0, 6).join(', ')}${fwNames.length > 6 ? ` +${fwNames.length - 6} more` : ''}`);
  const infraNames = uniq(infraFindings.map((f) => f.name));
  if (infraNames.length) cb.log('info', `Infra: ${infraNames.join(', ')}`);
  analysis.summary.counts.dependencies = depByKey.size;
  emit(true);

  // ── 5b. Source download under budget, parse in workers as batches land
  const dataFiles = role('data').filter((f) => PARSEABLE_EXT.has(extname(f.path)) || f.path.endsWith('.prisma'));
  const sources = [...dataFiles, ...role('source').filter((f) => PARSEABLE_EXT.has(extname(f.path)))].sort((a, b) => b.priority - a.priority);
  const selected: ClassifiedFile[] = [];
  let plannedBytes = 0;
  for (const f of sources) {
    if (selected.length >= fileBudget || plannedBytes + f.size > byteBudget) break;
    selected.push(f);
    plannedBytes += f.size;
  }
  const skipped = sources.length - selected.length;
  if (skipped > 0) {
    analysis.warnings.push(`Partial analysis: parsed the ${formatNumber(selected.length)} most important of ${formatNumber(sources.length)} source files (budget ${formatNumber(fileBudget)} files / ${formatBytes(byteBudget)}). ${formatNumber(skipped)} lower-priority files (examples, deep paths) were skipped.`);
    cb.log('warn', `Large repo: parsing top ${formatNumber(selected.length)} of ${formatNumber(sources.length)} source files by importance`);
  }
  cb.log('step', `Downloading ${formatNumber(selected.length)} source files from raw.githubusercontent.com (16 parallel)…`);

  const facts = new Map<string, FileFacts>();
  const fileMeta = new Map(selected.map((f) => [f.path, f]));
  const parseJobs: Promise<void>[] = [];
  let parsed = 0;
  let routeCount = 0;
  const schemaFiles = new Map<string, string>();

  const addFileNode = (ff: FileFacts) => {
    const cf = fileMeta.get(ff.path)!;
    g.addNode({
      id: `file:${ff.path}`,
      kind: 'file',
      label: basename(ff.path),
      layer: refineLayer(inferLayerFromPath(ff.path, cf.role), ff),
      confidence: 'confirmed',
      meta: { path: ff.path, loc: ff.loc, size: cf.size, language: cf.language, module: moduleOf(ff.path), role: cf.role, routes: ff.routes.length, parser: ff.parser, parseError: ff.parseError },
      evidence: [{ type: 'file', ref: `${ff.path}:1` }],
    });
  };

  for (const batch of chunk(selected, 96)) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const texts = await pool(batch, concurrency, (f) => download(f.path), signal);
    const files = batch.map((f, i) => ({ path: f.path, content: texts[i] ?? '' })).filter((f) => f.content);
    for (const f of files) if (f.path.endsWith('.prisma')) schemaFiles.set(f.path, f.content);
    parseJobs.push(
      opts.backend.parseBatch(files).then((results) => {
        for (const r of results) {
          facts.set(r.path, r);
          addFileNode(r);
          routeCount += r.routes.length;
        }
        parsed += results.length;
        cb.progress?.(0.3 + 0.45 * (parsed / Math.max(1, selected.length)), 'Parsing');
        emit();
      }),
    );
    cb.log('info', `Downloaded ${formatNumber(Math.min(selected.length, (parseJobs.length) * 96))}/${formatNumber(selected.length)} files · ${formatBytes(bytesDownloaded)} · ${formatNumber(routeCount)} routes so far`);
  }
  await Promise.all(parseJobs);
  const dl = rawStats();
  if (dl.failed > 0) {
    const msg = dl.throttled
      ? `raw.githubusercontent.com is rate-limiting this network (HTTP 429): ${dl.failed} of ${selected.length} files could not be downloaded. Wait a few minutes and re-scan.`
      : `${dl.failed} of ${selected.length} files could not be downloaded.`;
    analysis.warnings.push(msg);
    cb.log('warn', msg);
    if (selected.length > 0 && facts.size === 0) throw new GithubError(msg, 429, true);
  }
  const parseErrors = [...facts.values()].filter((f) => f.parseError).length;
  cb.log('success', `Parsed ${formatNumber(facts.size)} files in ${Math.round((performance.now() - t0) / 100) / 10}s${parseErrors ? ` (${parseErrors} fell back to pattern matching)` : ''}`);

  // ── 7. Endpoints
  // mount prefixes: file → prefixes contributed by app.use('/x', router) / include('app.urls')
  const parentMounts = new Map<string, { parent: string; prefix: string }[]>();
  for (const ff of facts.values()) {
    for (const m of ff.mounts) {
      const r = resolver.resolve(ff.path, m.spec);
      if (r?.kind !== 'file') continue;
      if (!parentMounts.has(r.path)) parentMounts.set(r.path, []);
      parentMounts.get(r.path)!.push({ parent: ff.path, prefix: m.prefix });
    }
  }
  const prefixMemo = new Map<string, string[]>();
  const prefixesOf = (file: string, depth = 0): string[] => {
    if (prefixMemo.has(file)) return prefixMemo.get(file)!;
    const parents = parentMounts.get(file);
    if (!parents || depth > 4) return [''];
    prefixMemo.set(file, ['']); // cycle guard
    const out = uniq(parents.flatMap((p) => prefixesOf(p.parent, depth + 1).map((pp) => joinRoute(pp, p.prefix)))).slice(0, 4);
    prefixMemo.set(file, out);
    return out;
  };

  interface EndpointRec extends RouteFact { file: string }
  const endpoints: EndpointRec[] = [];
  for (const ff of facts.values()) {
    for (const r of ff.routes) {
      const prefixes = r.framework === 'GraphQL' || r.framework === 'NestJS' || r.framework === 'Spring' ? [''] : prefixesOf(ff.path);
      for (const p of prefixes) endpoints.push({ ...r, path: r.framework === 'GraphQL' ? r.path : joinRoute(p, r.path), file: ff.path });
    }
  }
  const fileRoutes = extractFileRoutes(scoped.map((f) => f.path), fwRoots, (p) => facts.get(p)?.exports);
  endpoints.push(...fileRoutes);

  const endpointIds: { id: string; method: string; segs: string[] }[] = [];
  for (const e of endpoints) {
    const id = `endpoint:${e.method} ${e.path}@${e.file}`;
    g.addNode({
      id,
      kind: 'endpoint',
      label: `${e.method} ${e.path}`,
      layer: e.method === 'PAGE' ? 'frontend' : 'api',
      confidence: e.framework.includes('style') ? 'likely' : 'confirmed',
      meta: { method: e.method, path: e.path, file: e.file, line: e.line, framework: e.framework, handler: e.handler, module: moduleOf(e.file) },
      evidence: [{ type: 'file', ref: `${e.file}:${e.line}`, snippet: e.snippet }],
    });
    if (!g.has(`file:${e.file}`)) {
      // file-system route whose file wasn't downloaded: still show the file
      const cf = classified.find((c) => c.path === e.file);
      if (cf) {
        fileMeta.set(cf.path, cf);
        addFileNode({ path: cf.path, loc: 0, imports: [], exports: [], routes: [e], mounts: [], clientCalls: [], hasJsx: false, parser: 'none' });
      }
    }
    g.addEdge(id, `file:${e.file}`, 'handles');
    endpointIds.push({ id, method: e.method, segs: normalizeRoute(e.path) });
  }
  const apiCount = endpoints.filter((e) => e.method !== 'PAGE').length;
  const pageCount = endpoints.length - apiCount;
  const fws = uniq(endpoints.map((e) => e.framework));
  cb.log(endpoints.length ? 'success' : 'warn', endpoints.length
    ? `Found ${formatNumber(apiCount)} endpoints${pageCount ? ` + ${formatNumber(pageCount)} pages` : ''} (${fws.slice(0, 4).join(', ')})`
    : 'No statically declared routes found');
  cb.progress?.(0.8, 'Endpoints');

  // ── 8. Module graph
  const moduleFiles = new Map<string, string[]>();
  const pkgUsers = new Map<string, Set<string>>();
  for (const ff of facts.values()) {
    const mod = moduleOf(ff.path);
    if (!moduleFiles.has(mod)) moduleFiles.set(mod, []);
    moduleFiles.get(mod)!.push(ff.path);
    for (const imp of ff.imports) {
      const r = resolver.resolve(ff.path, imp.spec);
      if (!r) continue;
      if (r.kind === 'file' || r.kind === 'files') {
        for (const target of r.kind === 'file' ? [r.path] : r.paths) {
          if (target !== ff.path && facts.has(target)) g.addEdge(`file:${ff.path}`, `file:${target}`, 'imports');
        }
      } else {
        const pkg = r.name;
        if (!pkgUsers.has(pkg)) pkgUsers.set(pkg, new Set());
        pkgUsers.get(pkg)!.add(ff.path);
        const entry = lookupPackage(pkg);
        if (entry && (entry.kind !== 'framework' || entry.layer === 'data')) {
          const nodeId = catalogNodeId(entry);
          addCatalogNode(entry, { type: 'file', ref: `${ff.path}:${imp.line}`, snippet: `import … from '${imp.spec}'` }, {}, g.has(nodeId) ? 'confirmed' : 'likely');
          g.addEdge(`module:${mod}`, nodeId, entry.kind === 'datastore' || entry.layer === 'data' ? 'readsWrites' : 'calls');
          g.addEdge(`file:${ff.path}`, nodeId, entry.kind === 'datastore' || entry.layer === 'data' ? 'readsWrites' : 'calls');
        }
      }
    }
  }
  // dependency usage
  for (const n of g.nodes.values()) {
    if (n.kind !== 'dependency') continue;
    const users = pkgUsers.get(n.label) ?? pkgUsers.get(n.label.toLowerCase());
    n.meta.usedBy = users?.size ?? 0;
    if (users) n.meta.usedByFiles = [...users].slice(0, 40);
  }
  // Prisma datasource → datastore
  for (const [path, text] of schemaFiles) {
    const provider = text.match(/datasource\s+\w+\s*\{[^}]*provider\s*=\s*"(\w+)"/)?.[1];
    const models = [...text.matchAll(/^model\s+(\w+)/gm)].map((m) => m[1]);
    const names: Record<string, string> = { postgresql: 'PostgreSQL', mysql: 'MySQL', sqlite: 'SQLite', mongodb: 'MongoDB', sqlserver: 'SQL Server', cockroachdb: 'CockroachDB' };
    if (provider && names[provider]) {
      const node = g.addNode({
        id: `store:${names[provider]}`, kind: 'datastore', label: names[provider], layer: 'data', confidence: 'confirmed',
        meta: { category: 'SQL database', logo: provider === 'postgresql' ? 'postgresql' : provider },
        evidence: [{ type: 'file', ref: `${path}:1`, snippet: `provider = "${provider}"` }],
      });
      node.meta.models = uniq([...((node.meta.models as string[]) ?? []), ...models]);
      if (g.has('fw:Prisma')) g.addEdge('fw:Prisma', node.id, 'readsWrites');
    }
  }

  // client calls → endpoints (frontend → API relationships)
  let callLinks = 0;
  for (const ff of facts.values()) {
    for (const call of ff.clientCalls) {
      const segs = normalizeRoute(call.path);
      for (const ep of endpointIds) {
        if (ep.method === 'PAGE') continue;
        if (ep.method !== 'ANY' && ep.method !== call.method && !(call.method === 'GET' && ep.method === 'QUERY')) continue;
        if (routeMatches(ep.segs, segs)) {
          g.addEdge(`file:${ff.path}`, ep.id, 'calls', 'likely');
          callLinks++;
        }
      }
    }
  }
  if (callLinks) cb.log('info', `Linked ${callLinks} client calls (fetch/axios) to their endpoints`);

  // module nodes
  for (const [mod, files] of moduleFiles) {
    const layerLoc: Partial<Record<Layer, number>> = {};
    let loc = 0;
    const langs: Record<string, number> = {};
    for (const p of files) {
      const n = g.get(`file:${p}`)!;
      const l = (n.meta.loc as number) || 1;
      loc += l;
      layerLoc[n.layer!] = (layerLoc[n.layer!] ?? 0) + l;
      const lang = String(n.meta.language);
      langs[lang] = (langs[lang] ?? 0) + l;
    }
    const layer = (Object.entries(layerLoc).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'service') as Layer;
    const modEndpoints = endpoints.filter((e) => moduleOf(e.file) === mod);
    g.addNode({
      id: `module:${mod}`,
      kind: 'module',
      label: mod,
      layer,
      confidence: 'confirmed',
      meta: {
        path: mod,
        files: files.length,
        filesInTree: classified.filter((c) => c.role === 'source' && moduleOf(c.path) === mod).length,
        loc,
        languages: langs,
        endpoints: modEndpoints.filter((e) => e.method !== 'PAGE').length,
        pages: modEndpoints.filter((e) => e.method === 'PAGE').length,
      },
      evidence: [{ type: 'file', ref: `${mod}/` }],
    });
  }
  // aggregate file imports into module edges
  const moduleEdges = new Map<string, number>();
  for (const e of g.edges.values()) {
    if (e.kind !== 'imports') continue;
    const a = g.get(e.source)?.meta.module as string | undefined;
    const b = g.get(e.target)?.meta.module as string | undefined;
    if (!a || !b || a === b) continue;
    const k = `${a}\u0000${b}`;
    moduleEdges.set(k, (moduleEdges.get(k) ?? 0) + 1);
  }
  for (const [k, w] of moduleEdges) {
    const [a, b] = k.split('\u0000');
    g.addEdge(`module:${a}`, `module:${b}`, 'imports', 'confirmed', w);
  }
  const cycles = countCycles([...moduleFiles.keys()], [...moduleEdges.keys()].map((k) => k.split('\u0000') as [string, string]));
  const importEdges = [...g.edges.values()].filter((e) => e.kind === 'imports' && e.source.startsWith('file:')).length;
  cb.log('success', `Module graph: ${moduleFiles.size} modules · ${formatNumber(importEdges)} import edges${cycles ? ` · ${cycles} circular` : ''}`);
  emit(true);

  // ── 9. Enrichment + inference
  if (opts.enrich !== false && depByKey.size) {
    cb.log('step', `Checking ${formatNumber(depByKey.size)} dependencies against OSV.dev and deps.dev…`);
    const queries: DepQuery[] = [...depByKey.entries()]
      .map(([key, decls]) => ({ key, name: decls[0].name, ecosystem: decls[0].ecosystem, version: coerceVersion(decls[0].spec), dev: decls.every((d) => d.dev) }))
      .sort((a, b) => Number(a.dev) - Number(b.dev));
    try {
      const enriched = await enrichDependencies(queries, { signal, onProgress: (m) => cb.log('info', m) });
      let vulnPkgs = 0;
      let vulnTotal = 0;
      for (const [key, e] of enriched) {
        const n = g.get(key)!;
        const version = n.meta.version as string | null;
        const behind = e.latest && version ? Math.max(0, (majorOf(e.latest) ?? 0) - (majorOf(version) ?? 0)) : undefined;
        const staleDays = e.latestPublished ? (Date.now() - new Date(e.latestPublished).getTime()) / 86_400_000 : undefined;
        const spec = String(n.meta.spec ?? '');
        for (const v of e.vulns) v.rangeAllowsFix = rangeAdmits(spec, v.fixed);
        Object.assign(n.meta, {
          vulns: e.vulns,
          latest: e.latest,
          latestPublished: e.latestPublished,
          versionPublished: e.versionPublished,
          license: e.licenses?.join(' OR '),
          deprecated: e.deprecated,
          majorsBehind: behind,
          stale: staleDays !== undefined && staleDays > 730,
        });
        if (e.vulns.length) {
          vulnPkgs++;
          vulnTotal += e.vulns.length;
          for (const v of e.vulns.slice(0, 3)) n.evidence.push({ type: 'manifest', ref: v.url, snippet: `${v.id} (${v.severity}) ${v.summary}` });
        }
      }
      cb.log(vulnTotal ? 'warn' : 'success', vulnTotal ? `Found ${vulnTotal} known vulnerabilities in ${vulnPkgs} packages` : 'No known vulnerabilities in declared versions');
    } catch (err) {
      if ((err as Error).name === 'AbortError') throw err;
      analysis.warnings.push('Dependency enrichment failed (OSV.dev / deps.dev unreachable).');
    }
  }
  cb.progress?.(0.95, 'Health');

  // layer nodes
  for (const layer of LAYERS) {
    const members = [...g.nodes.values()].filter((n) => n.layer === layer && (n.kind === 'module' || n.kind === 'service' || n.kind === 'datastore' || n.kind === 'infra'));
    if (!members.length) continue;
    g.addNode({ id: `layer:${layer}`, kind: 'layer', label: layer, layer, confidence: 'inferred', meta: { members: members.length }, evidence: [] });
  }

  // summary
  const nodes = [...g.nodes.values()];
  const svcNodes = nodes.filter((n) => n.kind === 'service');
  const storeNodes = nodes.filter((n) => n.kind === 'datastore');
  analysis.summary.stack = uniq([
    ...topLangs.map(([l]) => l),
    ...fwNames.slice(0, 8),
    ...storeNodes.map((n) => n.label),
    ...svcNodes.slice(0, 6).map((n) => n.label),
  ]);
  const totalLoc = [...facts.values()].reduce((s, f) => s + f.loc, 0);
  analysis.summary.counts = {
    ...analysis.summary.counts,
    filesAnalyzed: facts.size,
    loc: totalLoc,
    endpoints: apiCount,
    pages: pageCount,
    modules: moduleFiles.size,
    dependencies: depByKey.size,
    vulnerabilities: nodes.reduce((s, n) => s + ((n.meta.vulns as unknown[])?.length ?? 0), 0),
    services: svcNodes.length,
    datastores: storeNodes.length,
    importEdges,
  };
  const has = (re: RegExp) => scoped.some((f) => re.test(f.path)) || tree.files.some((f) => !f.path.includes('/') && re.test(f.path));
  analysis.summary.health = repoHealth({ ...analysis, nodes }, {
    sourceFiles: role('source').length,
    testFiles: role('test').length,
    hasCi: infraFindings.some((f) => f.category === 'CI/CD'),
    hasReadme: has(/(^|\/)readme(\.\w+)?$/i),
    hasDocsDir: has(/^(docs?|documentation)\//i),
    hasLicense: Boolean(repo.license) || has(/(^|\/)(licen[sc]e|copying)(\.\w+)?$/i),
    hasContributing: has(/(^|\/)contributing(\.\w+)?$/i),
    bigFiles: [...facts.values()].filter((f) => f.loc > 800).length,
    analyzedFiles: facts.size,
    moduleCycles: cycles,
    moduleCount: moduleFiles.size,
  });
  analysis.context.stats = {
    filesInTree: scoped.length,
    filesAnalyzed: facts.size,
    bytesDownloaded,
    durationMs: Math.round(performance.now() - t0),
  };
  const h = analysis.summary.health;
  cb.log('success', `Health score ${h.score}/100 (${grade(h.score)}) · done in ${(analysis.context.stats.durationMs / 1000).toFixed(1)}s`);
  cb.progress?.(1, 'Done');
  emit(true);
  const { nodes: finalNodes, edges } = g.toArrays();
  return { ...analysis, nodes: finalNodes, edges };
}

/** '18.2.0' → '18', '0.115.0' → '0.115' */
export function shortVersion(v: string): string {
  const [major, minor] = v.split('.');
  return major === '0' && minor ? `0.${minor}` : major;
}

/** Facts-based layer refinement on top of the path heuristic. */
function refineLayer(pathLayer: Layer, ff: FileFacts): Layer {
  if (ff.routes.some((r) => r.method !== 'PAGE')) return 'api';
  if (ff.hasJsx && pathLayer !== 'api') return 'frontend';
  if (pathLayer === 'service') {
    const dataImport = ff.imports.some((i) => {
      const e = lookupPackage(i.spec.split('/')[0].startsWith('@') ? i.spec.split('/').slice(0, 2).join('/') : i.spec.split('/')[0]);
      return e?.kind === 'datastore' || e?.layer === 'data';
    });
    if (dataImport) return 'data';
  }
  return pathLayer;
}

function normalizeRoute(path: string): string[] {
  const p = path.replace(/^https?:\/\/[^/]+/, '').split(/[?#]/)[0];
  return p.split('/').filter(Boolean).map((s) => (/^[:*{[$]/.test(s) || /^:param$/.test(s) ? ':' : s.toLowerCase()));
}

function routeMatches(pattern: string[], actual: string[]): boolean {
  if (pattern.length !== actual.length) {
    // catch-all
    if (!(pattern.length && pattern[pattern.length - 1] === ':' && actual.length >= pattern.length)) return false;
  }
  for (let i = 0; i < pattern.length; i++) {
    if (pattern[i] === ':' || actual[i] === ':') continue;
    if (pattern[i] !== actual[i]) return false;
  }
  return pattern.length > 0;
}

/** Tarjan SCC: number of modules participating in circular dependencies. */
function countCycles(nodes: string[], edges: [string, string][]): number {
  const adj = new Map<string, string[]>(nodes.map((n) => [n, []]));
  for (const [a, b] of edges) adj.get(a)?.push(b);
  let index = 0;
  const idx = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  const on = new Set<string>();
  let inCycles = 0;
  const strong = (v: string) => {
    idx.set(v, index);
    low.set(v, index++);
    stack.push(v);
    on.add(v);
    for (const w of adj.get(v) ?? []) {
      if (!idx.has(w)) {
        strong(w);
        low.set(v, Math.min(low.get(v)!, low.get(w)!));
      } else if (on.has(w)) low.set(v, Math.min(low.get(v)!, idx.get(w)!));
    }
    if (low.get(v) === idx.get(v)) {
      let size = 0;
      let w: string;
      do {
        w = stack.pop()!;
        on.delete(w);
        size++;
      } while (w !== v);
      if (size > 1) inCycles += size;
    }
  };
  for (const n of nodes) if (!idx.has(n)) strong(n);
  return inCycles;
}
