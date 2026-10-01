import { GraphBuilder } from '../../core/graph';
import { urlHealth } from '../../core/health';
import { newAnalysis, type Analysis, type Confidence, type PipelineCallbacks } from '../../core/model';
import { edgeFetch, normalizeUrlInput } from '../../sources/edge';
import { formatBytes, formatNumber, uniq } from '../../lib/util';
import { enrichDependencies, majorOf } from '../repo/enrich';
import { lookupDns, interpretDns } from './dns';
import { FINGERPRINTS, type Fingerprint } from './fingerprints/rules';
import { analyzeHeaders, securityHeaders } from './headers';
import { inspectScripts } from './scripts';
import { CATEGORY_ORDER, classifyDomain } from './thirdparty';

/**
 * URL mode: passive analysis of what a site serves to any visitor. Every finding
 * carries a confidence label; architecture nodes we can only infer are 'inferred'.
 */
export async function runUrlPipeline(input: string, cb: PipelineCallbacks): Promise<Analysis> {
  const t0 = performance.now();
  const url = normalizeUrlInput(input);
  if (!url) throw new Error(`"${input}" is not a valid URL.`);
  const host = new URL(url).hostname;
  const analysis = newAnalysis('url', host);
  const g = new GraphBuilder();
  const emit = () => {
    const { nodes, edges } = g.toArrays();
    cb.update({ ...analysis, nodes, edges, summary: { ...analysis.summary }, context: { ...analysis.context } });
  };

  // ── 1. Edge fetch (+ DNS in parallel, straight from the browser)
  cb.log('step', `Fetching ${url} through the Stackscope edge function…`);
  const dnsPromise = lookupDns(host, cb.signal).catch(() => ({} as Record<string, string[]>));
  const page = await edgeFetch(url, cb.signal);
  const finalHost = new URL(page.finalUrl).hostname;
  for (const r of page.redirects) cb.log('info', `↪ ${r.status} ${r.url}`);
  cb.log('success', `HTTP ${page.status} · ${formatBytes(page.html.length)} HTML · ${Object.keys(page.headers).length} headers · ${page.allScripts.length} scripts${page.durationMs ? ` · ${page.durationMs} ms` : ''}`);
  cb.progress?.(0.3, 'Fetched');

  const html = page.html;
  const title = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ?? null;
  analysis.context.url = { input: url, finalUrl: page.finalUrl, status: page.status, redirects: page.redirects.map((r) => r.url), title, rendering: null, githubRepo: null };
  analysis.context.headers = page.headers;

  const site = `module:${finalHost}`;
  g.addNode({
    id: site, kind: 'module', label: finalHost, layer: 'frontend', confidence: 'confirmed',
    meta: { url: page.finalUrl, title, status: page.status, role: 'Web client' },
    evidence: [{ type: 'html', ref: page.finalUrl, snippet: title ?? undefined }],
  });

  // ── 2. Headers
  const headerHits = analyzeHeaders(page.headers);
  for (const h of headerHits) {
    const id = h.kind === 'infra' ? `infra:${h.name}` : h.kind === 'service' ? `svc:${h.name}` : `fw:${h.name}`;
    g.addNode({
      id, kind: h.kind, label: h.name, layer: h.layer, confidence: 'confirmed',
      meta: { category: h.category, logo: h.logo, version: h.version },
      evidence: [{ type: 'header', ref: h.header, snippet: `${h.header}: ${h.value}` }],
    });
    if (h.kind === 'infra') g.addEdge(id, site, 'servesFrom');
  }
  const sec = securityHeaders(page.headers);
  analysis.context.securityHeaders = sec;
  if (headerHits.length) cb.log('success', `Headers → ${headerHits.map((h) => h.name).join(', ')}`);
  cb.log(sec.filter((s) => s.present).length >= 5 ? 'success' : 'warn', `Security headers: ${sec.filter((s) => s.present).length}/${sec.length} present`);
  emit();

  // ── 3 + 4. Fingerprints over HTML, meta, script URLs and first-party bundles
  const metas: [string, string][] = [...html.matchAll(/<meta\b[^>]*>/gi)].map((m) => {
    const tag = m[0];
    const name = tag.match(/\b(?:name|property)\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase() ?? '';
    const content = tag.match(/\bcontent\s*=\s*["']([^"']*)["']/i)?.[1] ?? '';
    return [name, content];
  });
  const bundles = page.scripts.filter((s) => s.ok).map((s) => ({ url: s.url, content: s.content }));
  const bundleText = bundles.map((b) => b.content).join('\n');
  cb.log('info', `Inspecting ${bundles.length} first-party bundles (${formatBytes(bundles.reduce((s, b) => s + b.content.length, 0))})`);

  const detected = new Map<string, { fp: Fingerprint; evidence: { type: 'html' | 'script'; ref: string; snippet?: string }; version?: string }>();
  const markDetected = (fp: Fingerprint, evidence: { type: 'html' | 'script'; ref: string; snippet?: string }) => {
    if (detected.has(fp.name)) return;
    let version: string | undefined;
    for (const re of fp.version ?? []) {
      const m = (html + '\n' + bundleText.slice(0, 3_000_000)).match(re);
      if (m?.[1] && /\d/.test(m[1])) {
        version = m[1];
        break;
      }
    }
    detected.set(fp.name, { fp, evidence, version });
  };
  for (const fp of FINGERPRINTS) {
    for (const re of fp.html ?? []) {
      const m = html.match(re);
      if (m) { markDetected(fp, { type: 'html', ref: page.finalUrl, snippet: snippetAround(html, m.index ?? 0, m[0].length) }); break; }
    }
    for (const [name, re] of fp.meta ?? []) {
      const hit = metas.find(([n, c]) => n === name && re.test(c));
      if (hit) {
        const v = hit[1].match(re)?.[1];
        markDetected(fp, { type: 'html', ref: `<meta name="${name}">`, snippet: `${name}: ${hit[1]}` });
        if (v && !detected.get(fp.name)!.version) detected.get(fp.name)!.version = v;
      }
    }
    for (const re of fp.scriptSrc ?? []) {
      const src = page.allScripts.find((s) => re.test(s));
      if (src) { markDetected(fp, { type: 'script', ref: src }); break; }
    }
    for (const re of fp.js ?? []) {
      const b = bundles.find((x) => re.test(x.content));
      if (b) { const m = b.content.match(re)!; markDetected(fp, { type: 'script', ref: b.url, snippet: snippetAround(b.content, m.index ?? 0, m[0].length) }); break; }
    }
  }
  // implications (Next.js ⇒ React)
  for (const { fp } of [...detected.values()]) {
    for (const implied of fp.implies ?? []) {
      const target = FINGERPRINTS.find((f) => f.name === implied);
      if (target && !detected.has(implied)) detected.set(implied, { fp: target, evidence: { type: 'html', ref: `implied by ${fp.name}` } });
    }
  }
  for (const { fp, evidence, version } of detected.values()) {
    const id = fp.kind === 'infra' ? `infra:${fp.name}` : fp.kind === 'service' ? `svc:${fp.name}` : `fw:${fp.name}`;
    const implied = evidence.ref.startsWith('implied');
    g.addNode({
      id, kind: fp.kind, label: fp.name, layer: fp.layer, confidence: implied ? 'likely' : 'confirmed',
      meta: { category: fp.category, logo: fp.logo, version, repo: fp.repo },
      evidence: [evidence],
    });
    if (fp.layer === 'frontend') g.addEdge(site, id, 'dependsOn', 'confirmed');
    else if (fp.kind === 'service') g.addEdge(site, id, 'calls', 'likely');
  }
  if (detected.size) cb.log('success', `Detected ${[...detected.values()].map((d) => `${d.fp.name}${d.version ? ` ${d.version}` : ''}`).join(', ')}`);
  cb.progress?.(0.5, 'Fingerprints');
  emit();

  // rendering style
  const visibleText = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/gi, ' ').replace(/\s+/g, ' ').trim();
  let rendering: string;
  if (/self\.__next_f\.push/.test(html)) rendering = 'Server-rendered (React Server Components)';
  else if (/__NEXT_DATA__/.test(html)) rendering = /"isFallback":false[^]*"gsp":true|"nextExport":true/.test(html) ? 'Static (pre-rendered)' : 'Server-rendered (SSR/SSG)';
  else if (/window\.__NUXT__|__sveltekit_|__remixContext|__reactRouterContext/.test(html)) rendering = 'Server-rendered with hydration';
  else if (metas.some(([n, c]) => n === 'generator' && /Hugo|Jekyll|Eleventy|Docusaurus|VitePress|Astro|Gatsby/i.test(c))) rendering = 'Static site';
  else if (visibleText.length < 250 && /<div id="(root|app|__app)"/.test(html)) rendering = 'Single-page app (client-rendered)';
  else rendering = 'Server-rendered HTML';
  analysis.context.url.rendering = rendering;
  g.get(site)!.meta.rendering = rendering;
  cb.log('info', `Rendering style: ${rendering}`);

  // script findings
  const findings = inspectScripts(bundles, finalHost);
  for (const [origin, info] of findings.apiOrigins) {
    const id = `svc:${origin}`;
    const apiHost = origin.replace('https://', '');
    const tp = classifyDomain(apiHost);
    g.addNode({
      id, kind: 'service', label: apiHost, layer: tp ? 'external' : 'api', confidence: 'likely',
      meta: { category: tp?.category ?? 'API endpoint', references: info.count, provider: tp?.name },
      evidence: [{ type: 'script', ref: info.script, snippet: info.sample }],
    });
    g.addEdge(site, id, 'calls', 'likely');
  }
  for (const [route, info] of findings.routes) {
    g.addNode({
      id: `endpoint:ANY ${route}`, kind: 'endpoint', label: route, layer: 'api', confidence: 'inferred',
      meta: { method: 'ANY', path: route, framework: 'bundle string', file: info.script },
      evidence: [{ type: 'script', ref: info.script, snippet: info.sample.replace(/\s+/g, ' ') }],
    });
  }
  for (const op of findings.graphqlOps) {
    g.addNode({
      id: `endpoint:${op.type.toUpperCase()} ${op.name}`, kind: 'endpoint', label: `${op.type} ${op.name}`, layer: 'api', confidence: 'likely',
      meta: { method: op.type.toUpperCase(), path: op.name, framework: 'GraphQL operation', file: op.script },
      evidence: [{ type: 'script', ref: op.script, snippet: `${op.type} ${op.name}` }],
    });
  }
  if (findings.graphqlOps.length && !g.has('fw:GraphQL')) {
    g.addNode({ id: 'fw:GraphQL', kind: 'framework', label: 'GraphQL', layer: 'api', confidence: 'likely', meta: { category: 'API style', logo: 'graphql' }, evidence: [{ type: 'script', ref: findings.graphqlOps[0].script, snippet: `${findings.graphqlOps[0].type} ${findings.graphqlOps[0].name}` }] });
  }
  const sitemapPages = (page.extras.sitemap?.sample ?? []).slice(0, 60);
  for (const loc of sitemapPages) {
    try {
      const p = new URL(loc).pathname;
      g.addNode({ id: `endpoint:PAGE ${p}`, kind: 'endpoint', label: `PAGE ${p}`, layer: 'frontend', confidence: 'confirmed', meta: { method: 'PAGE', path: p, framework: 'sitemap.xml' }, evidence: [{ type: 'html', ref: `${new URL(page.finalUrl).origin}/sitemap.xml`, snippet: loc }] });
    } catch { /* bad loc */ }
  }
  const maps = page.scripts.filter((s) => s.sourceMapPublic);
  cb.log(findings.routes.size || findings.apiOrigins.size ? 'success' : 'info',
    `Bundles → ${findings.apiOrigins.size} API origins, ${findings.routes.size} route strings, ${findings.graphqlOps.length} GraphQL operations, ${findings.libraries.size} library banners`);
  if (maps.length) cb.log('warn', `${maps.length} public source map${maps.length > 1 ? 's' : ''} expose original source structure`);
  emit();

  // ── 5. Third-party map
  const resourceUrls = uniq([
    ...page.allScripts,
    ...[...html.matchAll(/<(?:link|img|iframe|source|video|audio)\b[^>]*\b(?:href|src)\s*=\s*["'](https?:)?\/\/([^"'/]+)/gi)].map((m) => `https://${m[2]}`),
  ]);
  const external = new Map<string, string[]>();
  const brand = finalHost.split('.').slice(-2)[0];
  for (const u of resourceUrls) {
    let h: string;
    try { h = new URL(u).hostname.toLowerCase(); } catch { continue; }
    if (h === finalHost || h.endsWith('.' + finalHost.split('.').slice(-2).join('.')) || (brand.length >= 4 && h.includes(brand))) continue;
    if (!external.has(h)) external.set(h, []);
    external.get(h)!.push(u);
  }
  let mixedContent = 0;
  if (page.finalUrl.startsWith('https:')) mixedContent = (html.match(/\b(?:src|href)\s*=\s*["']http:\/\/(?!localhost)/gi) ?? []).filter(() => true).length;
  for (const [h, urls] of external) {
    const tp = classifyDomain(h);
    const name = tp?.name ?? h;
    const id = `tp:${name}`;
    const node = g.addNode({
      id, kind: 'thirdParty', label: name, layer: 'external', confidence: tp ? 'confirmed' : 'likely',
      meta: { category: tp?.category ?? 'Other', domains: [] as string[] },
      evidence: [{ type: 'html', ref: urls[0] }],
    });
    const domains = node.meta.domains as string[];
    if (!domains.includes(h)) domains.push(h);
    g.addEdge(site, id, 'calls');
  }
  const tpCount = [...g.nodes.values()].filter((n) => n.kind === 'thirdParty').length;
  const byCat = new Map<string, number>();
  for (const n of g.nodes.values()) if (n.kind === 'thirdParty') byCat.set(String(n.meta.category), (byCat.get(String(n.meta.category)) ?? 0) + 1);
  cb.log('success', `Third parties: ${tpCount} services${byCat.size ? ` (${[...byCat].sort((a, b) => CATEGORY_ORDER.indexOf(a[0]) - CATEGORY_ORDER.indexOf(b[0])).map(([c, n]) => `${n} ${c.toLowerCase()}`).join(', ')})` : ''}`);
  cb.progress?.(0.65, 'Third parties');
  emit();

  // ── 6. DNS
  const dns = await dnsPromise;
  analysis.context.dns = dns;
  const dnsFindings = interpretDns(dns);
  for (const f of dnsFindings) {
    const isInfra = f.category === 'DNS provider' || f.category === 'Hosting';
    const id = isInfra ? `infra:${f.name}` : `tp:${f.name}`;
    g.addNode({
      id, kind: isInfra ? 'infra' : 'thirdParty', label: f.name, layer: isInfra ? 'infra' : 'external', confidence: 'confirmed',
      meta: { category: f.category },
      evidence: [{ type: 'dns', ref: `${f.record} ${f.record.startsWith('TXT') || f.record === 'MX' || f.record === 'NS' ? host.split('.').slice(-2).join('.') : host}`, snippet: f.value }],
    });
    if (f.category === 'Hosting') g.addEdge(id, site, 'servesFrom', 'likely');
  }
  cb.log('info', `DNS: ${Object.entries(dns).map(([k, v]) => `${v.length} ${k}`).join(', ') || 'no records'}${dnsFindings.length ? ` → ${uniq(dnsFindings.map((f) => f.name)).slice(0, 8).join(', ')}` : ''}`);
  cb.progress?.(0.75, 'DNS');

  // ── 7. Infer architecture: backend + API layer (dashed = inferred)
  const serverSide = [...g.nodes.values()].filter((n) => n.kind === 'framework' && n.layer === 'service');
  const apiNodes = [...g.nodes.values()].filter((n) => n.kind === 'service' && n.layer === 'api');
  const backendId = 'svc:origin-backend';
  const backendConf: Confidence = serverSide.length ? 'likely' : 'inferred';
  g.addNode({
    id: backendId, kind: 'service', label: serverSide.length ? `Backend (${serverSide.map((n) => n.label).join(', ')})` : 'Origin backend', layer: 'service', confidence: backendConf,
    meta: { category: 'Application server', note: 'Backend code is never visible from outside; this node summarises what the response reveals.' },
    evidence: serverSide.flatMap((n) => n.evidence).slice(0, 4),
  });
  g.addEdge(site, backendId, 'calls', 'inferred');
  for (const n of serverSide) g.addEdge(backendId, n.id, 'dependsOn', 'likely');
  for (const a of apiNodes) g.addEdge(a.id, backendId, 'calls', 'inferred');
  if (findings.routes.size && !apiNodes.length) {
    g.addNode({ id: 'svc:same-origin-api', kind: 'service', label: `${finalHost}/api`, layer: 'api', confidence: 'likely', meta: { category: 'Same-origin API', routes: findings.routes.size }, evidence: [...findings.routes.values()].slice(0, 3).map((r) => ({ type: 'script' as const, ref: r.script, snippet: r.sample.replace(/\s+/g, ' ') })) });
    g.addEdge(site, 'svc:same-origin-api', 'calls', 'likely');
    g.addEdge('svc:same-origin-api', backendId, 'calls', 'inferred');
  }
  for (const n of [...g.nodes.values()]) {
    if (n.kind === 'endpoint' && n.meta.method !== 'PAGE') g.addEdge(n.id, apiNodes[0]?.id ?? (g.has('svc:same-origin-api') ? 'svc:same-origin-api' : backendId), 'handles', 'inferred');
    if (n.kind === 'service' && /Backend-as-a-service/.test(String(n.meta.category))) n.layer = 'data';
  }

  // library banners → dependency health (partial)
  const libs = [...findings.libraries.entries()];
  for (const [pkg, info] of libs) {
    g.addNode({
      id: `dep:npm:${pkg}`, kind: 'dependency', label: pkg, confidence: 'likely',
      meta: { ecosystem: 'npm', spec: info.version, version: info.version, dev: false, usedBy: 1, source: 'bundle banner' },
      evidence: [{ type: 'script', ref: info.script, snippet: info.banner }],
    });
  }
  if (libs.length) {
    try {
      const enriched = await enrichDependencies(libs.map(([pkg, info]) => ({ key: `dep:npm:${pkg}`, name: pkg, ecosystem: 'npm' as const, version: info.version })), { signal: cb.signal, registryBudget: 20 });
      for (const [key, e] of enriched) {
        const n = g.get(key)!;
        Object.assign(n.meta, { vulns: e.vulns, latest: e.latest, latestPublished: e.latestPublished, license: e.licenses?.join(' OR '), majorsBehind: e.latest ? Math.max(0, (majorOf(e.latest) ?? 0) - (majorOf(String(n.meta.version)) ?? 0)) : undefined });
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') throw err;
    }
  }

  // ── 8. Repo bridge
  const ghCounts = new Map<string, number>();
  for (const m of html.matchAll(/github\.com\/([\w-]+)\/([\w.-]+?)(?:\.git)?(?=["'/?#\s<])/g)) {
    if (/(^|\.)github\.com$/.test(finalHost)) break;
    if (/^(sponsors|orgs|features|about|topics|settings|login|marketplace|apps|solutions|enterprise|pricing|team|customer-stories|readme|security|resources|collections|trending|site|contact|pulls|issues|notifications|new|codespaces|copilot|github|signup|join|events|premium-support|partners)$/.test(m[1])) continue;
    const key = `${m[1]}/${m[2]}`;
    ghCounts.set(key, (ghCounts.get(key) ?? 0) + 1);
  }
  const knownApp = [...detected.values()].find((d) => d.fp.repo)?.fp.repo ?? null;
  const linked = [...ghCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  analysis.context.url.githubRepo = linked ?? knownApp;
  if (analysis.context.url.githubRepo) cb.log('success', `Repo bridge: ${linked ? 'site links to' : 'site runs open-source'} github.com/${analysis.context.url.githubRepo}`);

  // ── summary + health
  if (page.htmlTruncated) analysis.warnings.push('HTML was larger than the 2 MB analysis cap and was truncated.');
  analysis.warnings.push('URL mode sees only what the site serves publicly: backend code, databases and private endpoints are invisible. Dashed nodes are inferred.');
  if (rendering.startsWith('Single-page')) analysis.warnings.push('This looks like a client-rendered SPA. Static fetch analysis cannot see API calls made after JavaScript runs.');
  const nodes = [...g.nodes.values()];
  const fws = nodes.filter((n) => n.kind === 'framework');
  analysis.summary.stack = uniq([
    ...fws.filter((n) => n.layer === 'frontend').map((n) => `${n.label}${n.meta.version ? ` ${n.meta.version}` : ''}`),
    ...fws.filter((n) => n.layer !== 'frontend').map((n) => n.label),
    ...nodes.filter((n) => n.kind === 'infra' && /CDN|Hosting|Edge/.test(String(n.meta.category))).map((n) => n.label),
  ]);
  analysis.summary.counts = {
    thirdParties: nodes.filter((n) => n.kind === 'thirdParty').length,
    endpoints: nodes.filter((n) => n.kind === 'endpoint' && n.meta.method !== 'PAGE').length,
    pages: page.extras.sitemap?.count ?? 0,
    scripts: page.allScripts.length,
    apiOrigins: findings.apiOrigins.size,
    sourceMaps: maps.length,
    dependencies: libs.length,
    vulnerabilities: nodes.reduce((s, n) => s + ((n.meta.vulns as unknown[])?.length ?? 0), 0),
    securityHeaders: sec.filter((s) => s.present).length,
    redirects: page.redirects.length,
  };
  analysis.summary.health = urlHealth({
    https: page.finalUrl.startsWith('https:'),
    securityHeaders: sec,
    thirdParties: nodes.filter((n) => n.kind === 'thirdParty' && n.meta.category !== 'Verified SaaS' && n.meta.category !== 'Email provider' && n.meta.category !== 'Email sending').length,
    exposedSourceMaps: maps.length,
    mixedContent,
  });
  analysis.context.stats = { filesInTree: 0, filesAnalyzed: bundles.length + 1, bytesDownloaded: html.length + bundles.reduce((s, b) => s + b.content.length, 0), durationMs: Math.round(performance.now() - t0) };
  cb.log('success', `Score ${analysis.summary.health.score}/100 (${analysis.summary.health.grade}) · ${formatNumber(nodes.length)} nodes · done in ${((performance.now() - t0) / 1000).toFixed(1)}s`);
  cb.progress?.(1, 'Done');
  emit();
  const { nodes: finalNodes, edges } = g.toArrays();
  return { ...analysis, nodes: finalNodes, edges };
}

function snippetAround(text: string, index: number, length: number): string {
  return text.slice(Math.max(0, index - 30), index + Math.min(length, 80) + 30).replace(/\s+/g, ' ').trim();
}
