import { AnimatePresence, motion } from 'framer-motion';
import { useMemo, useState, type ReactNode } from 'react';
import type { Analysis, Evidence, GraphEdge, GraphNode } from '../core/model';
import type { VulnInfo } from '../analyzers/repo/enrich';
import { blobUrl } from '../sources/github';
import { compact, formatBytes, formatNumber, timeAgo } from '../lib/util';
import { useAnalysis, type Indexes } from '../store/analysis';
import { useShallow } from 'zustand/react/shallow';
import { CodeView } from './CodeView';
import { Icon } from './Icon';
import { ConfidenceBadge, LayerBadge, LayerDot, MethodBadge, TechLogo } from './ui';

const KIND_LABEL: Record<GraphNode['kind'], string> = {
  file: 'File', module: 'Module', layer: 'Layer', endpoint: 'Endpoint', dependency: 'Package', framework: 'Framework',
  service: 'Service', datastore: 'Datastore', thirdParty: 'Third party', infra: 'Infrastructure',
};

const EDGE_LABEL: Record<GraphEdge['kind'], [string, string]> = {
  imports: ['Imports', 'Imported by'],
  calls: ['Calls', 'Called by'],
  handles: ['Handled by', 'Handles'],
  dependsOn: ['Uses', 'Used by'],
  servesFrom: ['Serves', 'Served by'],
  readsWrites: ['Reads / writes', 'Accessed by'],
};

const SEVERITY_COLOR: Record<VulnInfo['severity'], string> = {
  critical: 'var(--danger)', high: 'var(--danger)', moderate: 'var(--warn)', low: 'var(--muted)', unknown: 'var(--muted)',
};

export function DetailPanel() {
  const { analysis, idx, selectedId, select } = useAnalysis(useShallow((s) => ({ analysis: s.analysis, idx: s.idx, selectedId: s.selectedId, select: s.select })));
  const node = selectedId ? idx.byId.get(selectedId) : undefined;
  return (
    <AnimatePresence>
      {node && analysis && (
        <motion.aside
          key="panel"
          initial={{ x: 40, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 40, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 380, damping: 36 }}
          className="glass fixed inset-x-0 bottom-0 z-40 flex max-h-[75vh] flex-col rounded-t-2xl shadow-2xl lg:absolute lg:inset-y-3 lg:right-3 lg:left-auto lg:max-h-none lg:w-[420px] lg:rounded-2xl"
          style={{ background: 'color-mix(in srgb, var(--panel-solid) 94%, transparent)' }}
          aria-label="Details"
        >
          <PanelBody node={node} analysis={analysis} idx={idx} onSelect={select} />
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

function PanelBody({ node, analysis, idx, onSelect }: { node: GraphNode; analysis: Analysis; idx: Indexes; onSelect: (id: string | null) => void }) {
  const repo = analysis.context.repo;
  const sha = analysis.context.sha;
  const m = node.meta;
  const filePath = node.kind === 'file' ? String(m.path) : node.kind === 'endpoint' && repo ? (m.file as string | undefined) : undefined;
  const fileLine = node.kind === 'endpoint' ? (m.line as number | undefined) : undefined;
  const ghLink = repo && filePath ? blobUrl(repo.owner, repo.name, sha ?? repo.ref, filePath, fileLine) : undefined;

  return (
    <>
      <header className="flex items-start gap-3 border-b border-line p-4">
        <div className="mt-0.5">
          {m.logo ? <TechLogo slug={String(m.logo)} name={node.label} size={22} /> : <LayerDot layer={node.layer} size={10} />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="mono mb-1 text-[10px] uppercase tracking-wider text-faint">{KIND_LABEL[node.kind]}{m.category ? ` · ${m.category}` : ''}</div>
          <div className="flex items-center gap-2">
            {node.kind === 'endpoint' && <MethodBadge method={String(m.method)} />}
            <h2 className={`truncate font-semibold ${node.kind === 'file' || node.kind === 'endpoint' || node.kind === 'dependency' ? 'mono text-sm' : 'text-base'}`} title={node.label}>
              {node.kind === 'endpoint' ? String(m.path) : node.label}
            </h2>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <LayerBadge layer={node.layer} />
            <ConfidenceBadge confidence={node.confidence} />
            {typeof m.version === 'string' && m.version && <span className="mono rounded border border-line px-1.5 py-0.5 text-[10px] text-muted">v{m.version}</span>}
          </div>
        </div>
        <button type="button" onClick={() => onSelect(null)} className="focus-ring rounded-lg p-1 text-faint hover:text-text" aria-label="Close details">
          <Icon name="close" />
        </button>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto p-4 text-sm">
        <KindDetails node={node} analysis={analysis} onSelect={onSelect} />

        {filePath && repo && sha && (
          <Section title={fileLine ? `Code · line ${fileLine}` : 'Code'} action={ghLink && <ExtLink href={ghLink}>GitHub</ExtLink>}>
            <div className="overflow-hidden rounded-lg border border-line bg-bg-2">
              <CodeView owner={repo.owner} repo={repo.name} sha={sha} path={filePath} line={fileLine} />
            </div>
          </Section>
        )}

        <EvidenceList node={node} analysis={analysis} skipCodeFor={filePath} />
        <Connections node={node} idx={idx} onSelect={onSelect} />
      </div>
    </>
  );
}

function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="mono text-[11px] uppercase tracking-wider text-faint">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function ExtLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="focus-ring inline-flex items-center gap-1 rounded text-xs text-accent hover:underline">
      {children} <Icon name="external" size={12} />
    </a>
  );
}

function Rows({ rows }: { rows: [string, ReactNode][] }) {
  const visible = rows.filter(([, v]) => v !== undefined && v !== null && v !== '');
  if (!visible.length) return null;
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-lg border border-line bg-bg-2/60 p-3 text-[13px]">
      {visible.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-faint">{k}</dt>
          <dd className="min-w-0 truncate text-right">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function KindDetails({ node, analysis, onSelect }: { node: GraphNode; analysis: Analysis; onSelect: (id: string) => void }) {
  const m = node.meta;
  const list = (v: unknown) => (Array.isArray(v) && v.length ? (v as string[]).join(', ') : undefined);
  switch (node.kind) {
    case 'file':
      return (
        <Rows rows={[
          ['Path', <span className="mono text-xs" title={String(m.path)}>{String(m.path)}</span>],
          ['Language', String(m.language)],
          ['Lines', formatNumber(Number(m.loc ?? 0))],
          ['Size', formatBytes(Number(m.size ?? 0))],
          ['Module', <button type="button" className="mono text-xs text-accent hover:underline" onClick={() => onSelect(`module:${m.module}`)}>{String(m.module)}</button>],
          ['Routes', m.routes ? String(m.routes) : undefined],
          ['Parser', m.parseError ? <span className="text-warn" title={String(m.parseError)}>pattern fallback</span> : String(m.parser ?? '')],
        ]} />
      );
    case 'endpoint':
      return (
        <Rows rows={[
          ['Framework', String(m.framework ?? '')],
          ['Handler', m.handler ? <span className="mono text-xs">{String(m.handler)}</span> : undefined],
          ['File', m.file ? <span className="mono text-xs" title={String(m.file)}>{String(m.file).split('/').slice(-3).join('/')}{m.line ? `:${m.line}` : ''}</span> : undefined],
          ['Detection', node.confidence === 'inferred' ? 'string found in bundle' : 'static analysis'],
        ]} />
      );
    case 'dependency': {
      const vulns = (m.vulns as VulnInfo[] | undefined) ?? [];
      const eco = String(m.ecosystem);
      const registry = eco === 'npm' ? `https://www.npmjs.com/package/${node.label}` : eco === 'PyPI' ? `https://pypi.org/project/${node.label}/` : eco === 'Go' ? `https://pkg.go.dev/${node.label}` : eco === 'crates.io' ? `https://crates.io/crates/${node.label}` : undefined;
      const behind = Number(m.majorsBehind ?? 0);
      return (
        <>
          <Rows rows={[
            ['Declared', <span className="mono text-xs">{String(m.spec)}</span>],
            ['Latest', m.latest ? <span className={`mono text-xs ${behind > 0 ? 'text-warn' : 'text-ok'}`}>{String(m.latest)}{behind > 0 ? ` (${behind} major${behind > 1 ? 's' : ''} ahead)` : ''}</span> : undefined],
            ['Last publish', m.latestPublished ? timeAgo(String(m.latestPublished)) : undefined],
            ['License', m.license ? String(m.license) : undefined],
            ['Ecosystem', eco],
            ['Scope', m.dev ? 'development' : 'production'],
            ['Imported by', typeof m.usedBy === 'number' ? `${m.usedBy} file${m.usedBy === 1 ? '' : 's'}` : undefined],
            ['Status', m.deprecated ? <span className="text-danger">deprecated</span> : m.stale ? <span className="text-warn">no release in 2+ years</span> : undefined],
          ]} />
          <div className="flex gap-3">
            {registry && <ExtLink href={registry}>Registry</ExtLink>}
            <ExtLink href={`https://deps.dev/${eco === 'crates.io' ? 'cargo' : eco.toLowerCase()}/${encodeURIComponent(node.label)}`}>deps.dev</ExtLink>
          </div>
          {vulns.length > 0 && (
            <Section title={`Known vulnerabilities (${vulns.length})`}>
              <ul className="space-y-2">
                {vulns.map((v) => (
                  <li key={v.id} className="rounded-lg border border-line bg-bg-2/60 p-2.5">
                    <div className="flex items-center gap-2">
                      <span className="mono rounded px-1.5 py-0.5 text-[10px] uppercase" style={{ color: SEVERITY_COLOR[v.severity], background: `color-mix(in srgb, ${SEVERITY_COLOR[v.severity]} 14%, transparent)` }}>{v.severity}</span>
                      <a href={v.url} target="_blank" rel="noreferrer" className="mono text-xs text-accent hover:underline">{v.aliases.find((a) => a.startsWith('CVE')) ?? v.id}</a>
                      {v.fixed && <span className="mono ml-auto text-[11px] text-ok">fixed in {v.fixed}</span>}
                    </div>
                    {v.rangeAllowsFix && <div className="mt-1 text-[11px] text-ok">Your range {String(m.spec)} already allows {v.fixed}; refreshing the lockfile likely resolves this.</div>}
                    <div>
                    </div>
                    <p className="mt-1.5 text-xs text-muted">{v.summary}</p>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[11px] text-faint">Matched against the minimum version allowed by the manifest range; your lockfile may already resolve a fixed version.</p>
            </Section>
          )}
          {Array.isArray(m.usedByFiles) && (m.usedByFiles as string[]).length > 0 && (
            <Section title="Imported in">
              <ul className="space-y-0.5">
                {(m.usedByFiles as string[]).slice(0, 12).map((f) => (
                  <li key={f}>
                    <button type="button" onClick={() => onSelect(`file:${f}`)} className="mono w-full truncate text-left text-xs text-muted hover:text-accent">{f}</button>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </>
      );
    }
    case 'module': {
      const langs = Object.entries((m.languages as Record<string, number>) ?? {}).sort((a, b) => b[1] - a[1]);
      const files = analysis.nodes.filter((n) => n.kind === 'file' && n.meta.module === node.label).sort((a, b) => Number(b.meta.loc) - Number(a.meta.loc));
      return (
        <>
          <Rows rows={[
            ['Files analyzed', m.files !== undefined ? `${m.files}${m.filesInTree ? ` of ${m.filesInTree}` : ''}` : undefined],
            ['Lines', m.loc ? formatNumber(Number(m.loc)) : undefined],
            ['Languages', langs.length ? langs.slice(0, 3).map(([l]) => l).join(', ') : undefined],
            ['Endpoints', m.endpoints ? String(m.endpoints) : undefined],
            ['Pages', m.pages ? String(m.pages) : undefined],
            ['Rendering', m.rendering ? String(m.rendering) : undefined],
            ['Title', m.title ? String(m.title) : undefined],
            ['HTTP status', m.status ? String(m.status) : undefined],
          ]} />
          {files.length > 0 && (
            <Section title={`Largest files (${files.length})`}>
              <ul className="space-y-0.5">
                {files.slice(0, 14).map((f) => (
                  <li key={f.id}>
                    <button type="button" onClick={() => onSelect(f.id)} className="flex w-full items-center gap-2 text-left text-xs text-muted hover:text-accent">
                      <LayerDot layer={f.layer} size={6} />
                      <span className="mono truncate">{String(f.meta.path).slice(node.label.length + 1) || f.label}</span>
                      <span className="mono ml-auto text-faint">{compact(Number(f.meta.loc))}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </>
      );
    }
    default:
      return (
        <>
          <Rows rows={[
            ['Category', m.category ? String(m.category) : undefined],
            ['Version', m.version ? String(m.version) : undefined],
            ['Packages', list(m.packages)],
            ['Router', m.router ? String(m.router) : undefined],
            ['Provider', m.provider ? String(m.provider) : undefined],
            ['Domains', list(m.domains)],
            ['Workflows', list(m.workflowNames)],
            ['Triggers', list(m.triggers)],
            ['Jobs', list(m.jobs)],
            ['Base images', list(m.baseImages)],
            ['Exposed ports', list(m.exposedPorts)],
            ['Services', list(m.services)],
            ['Data models', list(m.models)],
            ['Providers', list(m.providers)],
            ['References', m.references ? String(m.references) : undefined],
            ['Config files', list(m.files)],
          ]} />
          {typeof m.note === 'string' && <p className="text-xs text-faint">{m.note}</p>}
          {typeof m.repo === 'string' && (
            <a href={`/r/${m.repo}`} className="inline-flex items-center gap-1.5 rounded-lg border border-accent px-3 py-1.5 text-xs text-accent hover:bg-accent-soft">
              <Icon name="github" size={14} /> Open {m.repo} in repo mode
            </a>
          )}
        </>
      );
  }
}

function EvidenceList({ node, analysis, skipCodeFor }: { node: GraphNode; analysis: Analysis; skipCodeFor?: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const repo = analysis.context.repo;
  const sha = analysis.context.sha;
  if (!node.evidence.length) return null;
  return (
    <Section title={`Evidence (${node.evidence.length})`}>
      <ul className="space-y-1.5">
        {node.evidence.map((ev, i) => {
          const loc = parseRef(ev);
          const key = `${ev.ref}#${i}`;
          const canOpen = loc && repo && sha && loc.path !== skipCodeFor;
          return (
            <li key={key} className="rounded-lg border border-line bg-bg-2/60">
              <div className="flex items-start gap-2 p-2.5">
                <span className="mono mt-0.5 shrink-0 rounded bg-line px-1.5 py-0.5 text-[10px] uppercase text-muted">{ev.type}</span>
                <div className="min-w-0 flex-1">
                  {loc && repo && sha ? (
                    <button type="button" onClick={() => setOpen(open === key ? null : key)} className="mono block max-w-full truncate text-left text-xs text-accent hover:underline" title={ev.ref}>
                      {ev.ref}
                    </button>
                  ) : /^https?:\/\//.test(ev.ref) ? (
                    <a href={ev.ref} target="_blank" rel="noreferrer" className="mono block truncate text-xs text-accent hover:underline" title={ev.ref}>{ev.ref}</a>
                  ) : (
                    <div className="mono truncate text-xs" title={ev.ref}>{ev.ref}</div>
                  )}
                  {ev.snippet && <div className="mono mt-1 line-clamp-3 break-all text-[11px] text-muted">{ev.snippet}</div>}
                </div>
                {loc && repo && <a href={blobUrl(repo.owner, repo.name, sha ?? repo.ref, loc.path, loc.line)} target="_blank" rel="noreferrer" className="shrink-0 text-faint hover:text-accent" aria-label="Open on GitHub"><Icon name="external" size={13} /></a>}
              </div>
              {open === key && canOpen && (
                <div className="border-t border-line">
                  <CodeView owner={repo.owner} repo={repo.name} sha={sha} path={loc.path} line={loc.line} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

function parseRef(ev: Evidence): { path: string; line?: number } | null {
  if (ev.type !== 'file' && ev.type !== 'manifest') return null;
  if (/^https?:\/\//.test(ev.ref)) return null;
  const m = ev.ref.match(/^(.*?):(\d+)$/);
  if (m) return { path: m[1], line: Number(m[2]) };
  if (ev.ref.endsWith('/')) return null;
  return { path: ev.ref };
}

function Connections({ node, idx, onSelect }: { node: GraphNode; idx: Indexes; onSelect: (id: string) => void }) {
  const groups = useMemo(() => {
    const out: { label: string; nodes: { node: GraphNode; weight?: number; confidence: string }[] }[] = [];
    const add = (label: string, edges: GraphEdge[], pick: (e: GraphEdge) => string) => {
      const items = edges
        .map((e) => ({ node: idx.byId.get(pick(e))!, weight: e.weight, confidence: e.confidence }))
        .filter((x) => x.node && x.node.kind !== 'layer')
        .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0));
      if (items.length) out.push({ label, nodes: items });
    };
    const outs = idx.out.get(node.id) ?? [];
    const ins = idx.in.get(node.id) ?? [];
    for (const kind of Object.keys(EDGE_LABEL) as GraphEdge['kind'][]) {
      add(EDGE_LABEL[kind][0], outs.filter((e) => e.kind === kind), (e) => e.target);
      add(EDGE_LABEL[kind][1], ins.filter((e) => e.kind === kind), (e) => e.source);
    }
    return out;
  }, [node.id, idx]);
  if (!groups.length) return null;
  return (
    <Section title="Connections">
      <div className="space-y-3">
        {groups.map((g) => (
          <div key={g.label}>
            <div className="mb-1 text-xs text-muted">{g.label} <span className="text-faint">({g.nodes.length})</span></div>
            <ul className="space-y-0.5">
              {g.nodes.slice(0, 12).map(({ node: n, weight, confidence }) => (
                <li key={n.id}>
                  <button type="button" onClick={() => onSelect(n.id)} className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left text-xs hover:bg-panel-hover">
                    <LayerDot layer={n.layer} size={6} />
                    <span className={`truncate ${n.kind === 'file' || n.kind === 'endpoint' ? 'mono' : ''}`}>{n.kind === 'file' ? String(n.meta.path) : n.label}</span>
                    {confidence !== 'confirmed' && <span className="text-[10px] text-faint">{confidence}</span>}
                    {weight && weight > 1 ? <span className="mono ml-auto text-faint">×{weight}</span> : null}
                  </button>
                </li>
              ))}
              {g.nodes.length > 12 && <li className="px-1 text-[11px] text-faint">+{g.nodes.length - 12} more</li>}
            </ul>
          </div>
        ))}
      </div>
    </Section>
  );
}
