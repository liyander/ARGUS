import { useMemo, useState } from 'react';
import { Icon } from '../components/Icon';
import { Chip, ConfidenceBadge, EmptyState, MethodBadge } from '../components/ui';
import type { GraphNode } from '../core/model';
import { PROJECT_REPO_URL } from '../lib/config';
import { useAnalysis } from '../store/analysis';
import { useShallow } from 'zustand/react/shallow';

interface TrieNode {
  seg: string;
  children: Map<string, TrieNode>;
  endpoints: GraphNode[];
  count: number;
}

function buildTrie(eps: GraphNode[]): TrieNode {
  const root: TrieNode = { seg: '/', children: new Map(), endpoints: [], count: 0 };
  for (const e of eps) {
    const path = String(e.meta.path);
    const segs = e.meta.framework === 'GraphQL' || /^(QUERY|MUTATION|SUBSCRIPTION)$/.test(String(e.meta.method)) ? ['graphql', String(e.meta.method).toLowerCase(), path] : path.split('/').filter(Boolean);
    let cur = root;
    cur.count++;
    for (const s of segs) {
      if (!cur.children.has(s)) cur.children.set(s, { seg: s, children: new Map(), endpoints: [], count: 0 });
      cur = cur.children.get(s)!;
      cur.count++;
    }
    cur.endpoints.push(e);
  }
  return root;
}

const PAGE_SIZE = 300;

export default function Endpoints() {
  const { analysis, select, selectedId } = useAnalysis(useShallow((s) => ({ analysis: s.analysis, select: s.select, selectedId: s.selectedId })));
  const [query, setQuery] = useState('');
  const [methods, setMethods] = useState<Set<string>>(new Set());
  const [showPages, setShowPages] = useState(false);
  const [mode, setMode] = useState<'table' | 'tree'>('table');
  const [limit, setLimit] = useState(PAGE_SIZE);

  const all = useMemo(() => (analysis?.nodes ?? []).filter((n) => n.kind === 'endpoint'), [analysis]);
  const pages = all.filter((n) => n.meta.method === 'PAGE').length;
  const available = useMemo(() => [...new Set(all.filter((n) => showPages || n.meta.method !== 'PAGE').map((n) => String(n.meta.method)))], [all, showPages]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all
      .filter((n) => showPages || n.meta.method !== 'PAGE' || all.every((x) => x.meta.method === 'PAGE'))
      .filter((n) => !methods.size || methods.has(String(n.meta.method)))
      .filter((n) => !q || `${n.meta.method} ${n.meta.path} ${n.meta.file ?? ''} ${n.meta.handler ?? ''}`.toLowerCase().includes(q))
      .sort((a, b) => String(a.meta.path).localeCompare(String(b.meta.path)));
  }, [all, query, methods, showPages]);

  if (!all.length) {
    return (
      <EmptyState icon="endpoints" title="No endpoints detected" action={<a className="text-sm text-accent hover:underline" href={`${PROJECT_REPO_URL}/issues/new?title=Missed%20routes:%20${encodeURIComponent(analysis?.target ?? '')}`} target="_blank" rel="noreferrer">Report a missed route pattern</a>}>
        Detection is static: routes built from variables or runtime config can be missed. Supported: Express, Fastify, Hono, Koa, NestJS, Next.js, SvelteKit, Nuxt, Remix, Flask, FastAPI, Django, Spring, JAX-RS, Go (net/http, Gin, Echo, chi, Fiber), Rails, Laravel, Symfony and GraphQL schemas.
      </EmptyState>
    );
  }

  const frameworks = [...new Set(all.map((n) => String(n.meta.framework)))];

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
        <div className="glass flex min-w-[220px] flex-1 items-center gap-2 rounded-lg px-3 py-1.5 sm:max-w-sm">
          <Icon name="search" size={14} className="text-faint" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter by path, file or handler…" className="mono w-full bg-transparent text-sm outline-none placeholder:text-faint" />
        </div>
        <div className="flex flex-wrap gap-1">
          {available.sort().map((m) => (
            <Chip key={m} active={methods.has(m)} onClick={() => setMethods((s) => { const n = new Set(s); if (n.has(m)) n.delete(m); else n.add(m); return n; })}>{m}</Chip>
          ))}
        </div>
        {pages > 0 && pages < all.length && <Chip active={showPages} onClick={() => setShowPages((v) => !v)}>pages ({pages})</Chip>}
        <div className="ml-auto flex rounded-lg border border-line p-0.5 text-xs">
          {(['table', 'tree'] as const).map((m) => (
            <button key={m} type="button" onClick={() => setMode(m)} className={`rounded-md px-2.5 py-1 ${mode === m ? 'bg-accent-soft text-text' : 'text-muted'}`}>{m === 'table' ? 'Table' : 'Route tree'}</button>
          ))}
        </div>
      </div>
      <div className="mono flex items-center gap-3 px-4 py-2 text-[11px] text-faint">
        <span>{filtered.length.toLocaleString()} of {all.length.toLocaleString()}</span>
        <span>·</span>
        <span className="truncate">{frameworks.join(', ')}</span>
        <span className="ml-auto hidden sm:inline">static detection — dynamic routes may be missed</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {mode === 'table' ? (
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-[var(--bg)]/90 text-left text-[11px] uppercase tracking-wider text-faint backdrop-blur">
              <tr>
                <th className="px-4 py-2 font-medium">Method</th>
                <th className="px-2 py-2 font-medium">Path</th>
                <th className="hidden px-2 py-2 font-medium md:table-cell">Handler</th>
                <th className="hidden px-2 py-2 font-medium lg:table-cell">Source</th>
                <th className="hidden px-4 py-2 font-medium xl:table-cell">Confidence</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, limit).map((n) => (
                <tr key={n.id} onClick={() => select(n.id)} className={`cursor-pointer border-t border-line transition hover:bg-panel-hover ${selectedId === n.id ? 'bg-accent-soft' : ''}`}>
                  <td className="px-4 py-2"><MethodBadge method={String(n.meta.method)} /></td>
                  <td className="mono max-w-[420px] truncate px-2 py-2 text-[13px]" title={String(n.meta.path)}>{highlightParams(String(n.meta.path))}</td>
                  <td className="mono hidden max-w-[200px] truncate px-2 py-2 text-xs text-muted md:table-cell">{String(n.meta.handler ?? '')}</td>
                  <td className="mono hidden max-w-[320px] truncate px-2 py-2 text-xs text-faint lg:table-cell" title={String(n.meta.file ?? '')}>
                    {n.meta.file ? `${String(n.meta.file).split('/').slice(-3).join('/')}${n.meta.line ? `:${n.meta.line}` : ''}` : ''}
                  </td>
                  <td className="hidden px-4 py-2 xl:table-cell"><ConfidenceBadge confidence={n.confidence} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="p-3"><TreeView node={buildTrie(filtered)} depth={0} onSelect={select} selectedId={selectedId} /></div>
        )}
        {mode === 'table' && filtered.length > limit && (
          <button type="button" onClick={() => setLimit((l) => l + PAGE_SIZE)} className="mx-auto my-4 block rounded-lg border border-line px-4 py-2 text-sm text-muted hover:text-text">
            Show {Math.min(PAGE_SIZE, filtered.length - limit)} more
          </button>
        )}
      </div>
    </div>
  );
}

function highlightParams(path: string) {
  return path.split(/(:[\w?*]+|\{[^}]+\}|\*\w*|<[^>]+>)/g).map((part, i) =>
    /^(:|\{|\*|<)/.test(part) ? <span key={i} className="text-l-data" style={{ color: 'var(--l-data)' }}>{part}</span> : part,
  );
}

function TreeView({ node, depth, onSelect, selectedId }: { node: TrieNode; depth: number; onSelect: (id: string) => void; selectedId: string | null }) {
  const [open, setOpen] = useState(depth < 2);
  const children = [...node.children.values()].sort((a, b) => b.count - a.count);
  return (
    <div>
      {depth > 0 && (
        <button type="button" onClick={() => setOpen((o) => !o)} className="mono flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left text-[13px] hover:bg-panel-hover" style={{ paddingLeft: depth * 16 }}>
          {children.length > 0 ? <Icon name="chevron" size={12} className={`text-faint transition ${open ? 'rotate-90' : ''}`} /> : <span className="w-3" />}
          <span>/{highlightParams(node.seg)}</span>
          <span className="text-[11px] text-faint">{node.count}</span>
        </button>
      )}
      {(open || depth === 0) && (
        <>
          {node.endpoints.map((e) => (
            <button key={e.id} type="button" onClick={() => onSelect(e.id)} className={`flex w-full items-center gap-2 rounded px-1 py-0.5 text-left text-xs hover:bg-panel-hover ${selectedId === e.id ? 'bg-accent-soft' : ''}`} style={{ paddingLeft: depth * 16 + 20 }}>
              <MethodBadge method={String(e.meta.method)} />
              <span className="mono truncate text-faint">{String(e.meta.file ?? '').split('/').slice(-2).join('/')}{e.meta.line ? `:${e.meta.line}` : ''}</span>
            </button>
          ))}
          {children.map((c) => <TreeView key={c.seg} node={c} depth={depth + 1} onSelect={onSelect} selectedId={selectedId} />)}
        </>
      )}
    </div>
  );
}
