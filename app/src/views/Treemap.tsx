import { hierarchy, treemap, treemapSquarify, type HierarchyRectangularNode } from 'd3';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../components/Icon';
import { Chip, EmptyState } from '../components/ui';
import { formatBytes, languageColor, languageOf } from '../lib/util';
import { useAnalysis } from '../store/analysis';
import { useShallow } from 'zustand/react/shallow';

interface TNode {
  name: string;
  path: string;
  size: number;
  children?: TNode[];
}

function buildTree(entries: { path: string; size: number }[], prefix: string): TNode {
  const root: TNode & { map?: Map<string, TNode & { map?: Map<string, TNode> }> } = { name: prefix || '/', path: prefix, size: 0, children: [], map: new Map() };
  for (const e of entries) {
    const rel = prefix ? e.path.slice(prefix.length + 1) : e.path;
    const parts = rel.split('/');
    let cur: typeof root = root;
    for (let i = 0; i < parts.length; i++) {
      const name = parts[i];
      const isLeaf = i === parts.length - 1;
      if (isLeaf) {
        cur.children!.push({ name, path: e.path, size: Math.max(1, e.size) });
      } else {
        let next = cur.map!.get(name);
        if (!next) {
          next = { name, path: cur.path ? `${cur.path}/${name}` : name, size: 0, children: [], map: new Map() };
          cur.map!.set(name, next);
          cur.children!.push(next);
        }
        cur = next as typeof root;
      }
    }
  }
  return root;
}

function useSize(ref: React.RefObject<HTMLElement | null>) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

export default function Treemap() {
  const { analysis, idx, select, selectedId } = useAnalysis(useShallow((s) => ({ analysis: s.analysis, idx: s.idx, select: s.select, selectedId: s.selectedId })));
  const box = useRef<HTMLDivElement>(null);
  const { w, h } = useSize(box);
  const [focus, setFocus] = useState('');
  const [metric, setMetric] = useState<'bytes' | 'files'>('bytes');
  const [assets, setAssets] = useState(false);
  const [hover, setHover] = useState<{ d: HierarchyRectangularNode<TNode>; x: number; y: number } | null>(null);
  const subPath = analysis?.context.repo?.subPath ?? '';
  const tree = analysis?.context.tree ?? [];

  const data = useMemo(() => {
    const scope = focus || subPath;
    const entries = (scope ? tree.filter((e) => e.path.startsWith(scope + '/')) : tree).filter((e) => assets || !ASSET_RE.test(e.path));
    return buildTree(entries, scope);
  }, [tree, focus, subPath, assets]);

  const layout = useMemo(() => {
    if (!w || !h) return null;
    const root = hierarchy<TNode>(data, (d) => d.children)
      .sum((d) => (d.children ? 0 : metric === 'bytes' ? d.size : 1))
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
    return treemap<TNode>().tile(treemapSquarify.ratio(1.2)).size([w, h]).paddingOuter(3).paddingTop((d) => (d.depth === 0 ? 3 : 17)).paddingInner(1.5).round(true)(root);
  }, [data, w, h, metric]);

  const rects = useMemo(() => {
    if (!layout) return [];
    return layout.descendants().filter((d) => d.depth > 0 && d.depth <= 4 && (d.x1 - d.x0) * (d.y1 - d.y0) >= 6);
  }, [layout]);

  const selectedPath = selectedId?.startsWith('file:') ? selectedId.slice(5) : null;

  if (!tree.length) return <EmptyState icon="treemap" title="No file tree yet">The treemap renders from the repository tree as soon as it is fetched.</EmptyState>;

  const crumbs = (focus || subPath).split('/').filter(Boolean);
  const baseDepth = subPath ? subPath.split('/').length : 0;

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
        <nav className="mono flex min-w-0 flex-1 items-center gap-1 overflow-x-auto text-xs">
          <button type="button" onClick={() => setFocus('')} className="rounded px-1.5 py-0.5 text-muted hover:text-accent">{analysis?.context.repo?.name ?? 'root'}</button>
          {crumbs.map((c, i) => i < baseDepth ? null : (
            <span key={i} className="flex items-center gap-1">
              <Icon name="chevron" size={11} className="text-faint" />
              <button type="button" onClick={() => setFocus(crumbs.slice(0, i + 1).join('/'))} className="rounded px-1.5 py-0.5 text-muted hover:text-accent">{c}</button>
            </span>
          ))}
        </nav>
        <Chip active={metric === 'bytes'} onClick={() => setMetric('bytes')}>size by bytes</Chip>
        <Chip active={metric === 'files'} onClick={() => setMetric('files')}>size by file count</Chip>
        <Chip active={assets} onClick={() => setAssets((a) => !a)}>include assets & lockfiles</Chip>
      </div>
      <div ref={box} className="relative min-h-0 flex-1" onMouseLeave={() => setHover(null)}>
        <svg width={w} height={h} className="block">
          {rects.map((d) => {
            const isDir = Boolean(d.children);
            const rw = d.x1 - d.x0;
            const rh = d.y1 - d.y0;
            const lang = isDir ? '' : languageOf(d.data.path);
            const color = languageColor(lang);
            const parsed = !isDir && idx.byId.has(`file:${d.data.path}`);
            const sel = !isDir && d.data.path === selectedPath;
            return (
              <g
                key={d.data.path + d.depth}
                transform={`translate(${d.x0},${d.y0})`}
                onMouseMove={(e) => {
                  const r = box.current!.getBoundingClientRect();
                  setHover({ d, x: e.clientX - r.left, y: e.clientY - r.top });
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (isDir) setFocus(d.data.path);
                  else if (parsed) select(`file:${d.data.path}`);
                }}
                className="cursor-pointer"
              >
                {isDir ? (
                  <>
                    <rect width={rw} height={rh} rx={4} fill="var(--panel)" stroke="var(--line-strong)" strokeOpacity={0.6} />
                    {rw > 40 && (
                      <text x={6} y={12} style={{ fontSize: 10, fill: 'var(--muted)', fontFamily: 'var(--font-mono)' }}>
                        {truncate(d.data.name + '/', rw / 6.4)}
                      </text>
                    )}
                  </>
                ) : (
                  <>
                    <rect width={rw} height={rh} rx={2} fill={color} fillOpacity={parsed ? 0.85 : 0.45} stroke={sel ? 'var(--accent)' : 'none'} strokeWidth={sel ? 2 : 0} />
                    {rw > 54 && rh > 16 && (
                      <text x={4} y={12} style={{ fontSize: 10, fill: '#0b1222', fontFamily: 'var(--font-mono)', pointerEvents: 'none' }}>
                        {truncate(d.data.name, rw / 6.2)}
                      </text>
                    )}
                  </>
                )}
              </g>
            );
          })}
        </svg>
        {hover && (
          <div className="glass pointer-events-none absolute z-20 max-w-xs rounded-lg px-2.5 py-1.5 text-xs" style={{ left: Math.min(hover.x + 14, w - 260), top: Math.min(hover.y + 14, h - 70), background: 'var(--panel-solid)' }}>
            <div className="mono truncate">{hover.d.data.path || '/'}{hover.d.children ? '/' : ''}</div>
            <div className="mt-0.5 text-faint">
              {hover.d.children
                ? `${hover.d.leaves().length.toLocaleString()} files · ${formatBytes(hover.d.leaves().reduce((s, l) => s + l.data.size, 0))} · click to zoom`
                : `${languageOf(hover.d.data.path)} · ${formatBytes(hover.d.data.size)}${idx.byId.has(`file:${hover.d.data.path}`) ? ' · parsed — click for details' : ' · not parsed'}`}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Binary assets and lockfiles dwarf code by bytes; hidden unless asked for. */
const ASSET_RE = /\.(png|jpe?g|gif|webp|avif|ico|svg|bmp|tiff|psd|woff2?|ttf|otf|eot|mp[34]|webm|mov|wav|ogg|pdf|zip|gz|tgz|jar|wasm|bin|lock|lockb)$|(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|poetry\.lock|Cargo\.lock|Gemfile\.lock|composer\.lock|go\.sum)$/i;

function truncate(s: string, max: number) {
  const n = Math.floor(max);
  return s.length > n ? s.slice(0, Math.max(1, n - 1)) + '…' : s;
}
