import { AnimatePresence, motion } from 'framer-motion';
import { memo, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { DetailPanel } from '../components/DetailPanel';
import { HealthRing } from '../components/HealthRing';
import { Icon } from '../components/Icon';
import { ScanLog } from '../components/ScanLog';
import { ShareDialog } from '../components/ShareDialog';
import { Skeleton } from '../components/ui';
import type { Analysis } from '../core/model';
import type { AnalysisInput } from '../core/pipeline';
import { compact, timeAgo } from '../lib/util';
import { useAnalysis } from '../store/analysis';
import { useShallow } from 'zustand/react/shallow';
import { useUi } from '../store/ui';
import { prefetchViews, ViewActiveContext, viewsFor, type ViewDef, type ViewId } from '../views/registry';

export default function Results({ mode }: { mode: 'repo' | 'url' }) {
  const params = useParams();
  const [search, setSearch] = useSearchParams();
  const input = useMemo<AnalysisInput | null>(() => {
    if (mode === 'repo') {
      const rest = params['*'] ? `/${params['*']}` : '';
      return params.owner && params.repo ? { mode, target: `${params.owner}/${params.repo}${rest}`.replace(/\/$/, '') } : null;
    }
    const raw = decodeURIComponent(params['*'] ?? '');
    return raw ? { mode, target: /^https?:\/\//.test(raw) ? raw : `https://${raw}` } : null;
  }, [mode, params]);

  const { analysis, status, log, progress, error, rateLimited, source, savedAt, selectedId, focusMode, open, select, toggleFocus, cancel } = useAnalysis(useShallow((s) => ({ analysis: s.analysis, status: s.status, log: s.log, progress: s.progress, error: s.error, rateLimited: s.rateLimited, source: s.source, savedAt: s.savedAt, selectedId: s.selectedId, focusMode: s.focusMode, open: s.open, select: s.select, toggleFocus: s.toggleFocus, cancel: s.cancel })));
  const { setShareOpen, setTokenOpen, setViewEl, toggleTheme } = useUi();
  const [logOpen, setLogOpen] = useState(true);

  useEffect(() => {
    if (input) void open(input);
  }, [input, open]);

  // show the log while a scan runs; tuck it away a few seconds after it finishes
  const prevStatus = useRef(status);
  useEffect(() => {
    const was = prevStatus.current;
    prevStatus.current = status;
    if (status === 'running') setLogOpen(true);
    if (was === 'running' && status === 'done') {
      const t = setTimeout(() => setLogOpen(false), 4000);
      return () => clearTimeout(t);
    }
  }, [status]);

  const views = viewsFor(mode);
  const viewParam = search.get('view') as ViewId | null;
  const view = views.find((v) => v.id === viewParam) ?? views[0];

  const setParam = useCallback(
    (key: string, value: string | null) =>
      setSearch((p) => {
        const next = new URLSearchParams(p);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      }, { replace: true }),
    [setSearch],
  );

  // URL ↔ selection
  const nodeParam = search.get('node');
  useEffect(() => {
    if (nodeParam && analysis && nodeParam !== selectedId && analysis.nodes.some((n) => n.id === nodeParam)) select(nodeParam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeParam, analysis]);
  // push selection changes into the URL — only real changes, so a shared ?node= link survives loading
  const prevSelected = useRef(selectedId);
  useEffect(() => {
    if (prevSelected.current === selectedId) return;
    prevSelected.current = selectedId;
    if ((selectedId ?? null) !== (nodeParam ?? null)) setParam('node', selectedId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  // keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable || e.metaKey || e.ctrlKey || e.altKey) return;
      const v = views.find((x) => x.key === e.key);
      if (v) setParam('view', v.id);
      else if (e.key === 'Escape') select(null);
      else if (e.key.toLowerCase() === 'f') toggleFocus();
      else if (e.key.toLowerCase() === 't') toggleTheme();
      else if (e.key.toLowerCase() === 'l') setLogOpen((o) => !o);
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [views, setParam, select, toggleFocus, toggleTheme]);

  // keep every visited view mounted (hidden when inactive) so switching back is instant
  const [visited, setVisited] = useState<ViewId[]>([]);
  useEffect(() => {
    setVisited((v) => (v.includes(view.id) ? v : [...v, view.id]));
  }, [view.id]);
  useEffect(() => {
    if (analysis) prefetchViews();
  }, [analysis]);
  // a new repo/site starts with a clean set of views
  useEffect(() => setVisited([]), [input?.mode, input?.target]);
  const running = status === 'running' || status === 'loading';

  if (status === 'error' && !analysis) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-4 px-4 py-20 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-line bg-panel text-danger"><Icon name="alert" size={26} /></div>
        <h1 className="text-2xl font-semibold">Couldn&apos;t analyze {input?.target.replace(/^https?:\/\//, '')}</h1>
        <p className="text-muted">{error}</p>
        <div className="flex gap-2">
          {rateLimited && <button type="button" onClick={() => setTokenOpen(true)} className="focus-ring rounded-lg bg-accent px-4 py-2 font-medium text-accent-ink">Add a GitHub token</button>}
          <button type="button" onClick={() => input && open(input, { force: true })} className="focus-ring rounded-lg border border-line px-4 py-2 hover:border-line-strong">Retry</button>
          <Link to="/" className="focus-ring rounded-lg border border-line px-4 py-2 hover:border-line-strong">New scan</Link>
        </div>
        {log.length > 0 && <div className="mt-4 w-full text-left"><ScanLog log={log} running={false} progress={progress} compact /></div>}
      </div>
    );
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <WorkspaceHeader
        analysis={analysis}
        input={input}
        status={status}
        source={source}
        savedAt={savedAt}
        onRescan={() => input && open(input, { force: true })}
        onCancel={cancel}
        onShare={() => setShareOpen(true)}
        focusMode={focusMode}
        onFocus={() => toggleFocus()}
      />
      <div className="relative flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* view switcher */}
        <nav className="z-10 flex shrink-0 gap-1 overflow-x-auto border-b border-line px-2 py-1.5 lg:w-[188px] lg:flex-col lg:overflow-visible lg:border-b-0 lg:border-r lg:px-2 lg:py-3" aria-label="Views">
          {views.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => setParam('view', v.id)}
              className={`focus-ring group flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition ${v.id === view.id ? 'bg-accent-soft text-text' : 'text-muted hover:bg-panel-hover hover:text-text'}`}
              aria-current={v.id === view.id ? 'page' : undefined}
            >
              <Icon name={v.icon} size={16} className={v.id === view.id ? 'text-accent' : ''} />
              <span>{v.label}</span>
              <span className="kbd ml-auto hidden lg:inline">{v.key}</span>
            </button>
          ))}
          <div className="mt-auto hidden space-y-2 px-2 pt-4 text-[11px] text-faint lg:block">
            <div><span className="kbd">F</span> focus mode</div>
            <div><span className="kbd">L</span> scan log</div>
            <div><span className="kbd">Esc</span> clear selection</div>
          </div>
        </nav>

        {/* canvas */}
        <main className="relative min-h-[60vh] min-w-0 flex-1 overflow-hidden">
          <div className="absolute inset-0">
            {analysis ? (
              views
                .filter((v) => v.id === view.id || visited.includes(v.id))
                .map((v) => <ViewPane key={v.id} def={v} active={v.id === view.id} onEl={setViewEl} />)
            ) : (
              <ViewSkeleton />
            )}
          </div>
          <DetailPanel />
          <AnimatePresence>
            {logOpen && log.length > 0 && (
              <motion.div
                data-no-export
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 16 }}
                className="absolute bottom-3 left-3 z-30 w-[min(560px,calc(100%-24px))]"
              >
                <ScanLog log={log} running={running} progress={progress} onClose={() => setLogOpen(false)} compact={!running} />
              </motion.div>
            )}
          </AnimatePresence>
          {!logOpen && log.length > 0 && (
            <button data-no-export type="button" onClick={() => setLogOpen(true)} className="glass focus-ring absolute bottom-3 left-3 z-30 flex items-center gap-2 rounded-full px-3 py-1.5 text-xs text-muted hover:text-text">
              <Icon name="terminal" size={13} /> scan log
            </button>
          )}
        </main>
      </div>
      <ShareDialog />
    </div>
  );
}

function WorkspaceHeader({ analysis, input, status, source, savedAt, onRescan, onCancel, onShare, focusMode, onFocus }: {
  analysis: Analysis | null;
  input: AnalysisInput | null;
  status: string;
  source: string;
  savedAt: string | null;
  onRescan: () => void;
  onCancel: () => void;
  onShare: () => void;
  focusMode: boolean;
  onFocus: () => void;
}) {
  const repo = analysis?.context.repo;
  const url = analysis?.context.url;
  const running = status === 'running' || status === 'loading';
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-4 py-3">
      <div className="flex min-w-0 flex-1 basis-full items-center gap-3 md:basis-0">
        {repo?.avatarUrl ? (
          <img src={repo.avatarUrl} alt="" className="h-10 w-10 rounded-xl border border-line" />
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-panel text-accent">
            <Icon name={input?.mode === 'url' ? 'globe' : 'github'} size={20} />
          </div>
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-lg font-semibold">
              {repo ? (
                <a href={`https://github.com/${repo.fullName}`} target="_blank" rel="noreferrer" className="hover:text-accent">{repo.fullName}</a>
              ) : url ? (
                <a href={url.finalUrl} target="_blank" rel="noreferrer" className="hover:text-accent">{url.finalUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')}</a>
              ) : (
                <span className="mono">{input?.target.replace(/^https?:\/\//, '')}</span>
              )}
            </h1>
            {repo?.subPath && <span className="mono rounded-md border border-line px-1.5 py-0.5 text-[11px] text-muted">/{repo.subPath}</span>}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted">
            {repo && (
              <>
                {repo.stars >= 0 && <span className="flex items-center gap-1"><Icon name="star" size={12} /> {compact(repo.stars)}</span>}
                <span className="mono">{repo.ref}{analysis?.context.sha ? ` @ ${analysis.context.sha.slice(0, 7)}` : ''}</span>
                {repo.license && <span>{repo.license}</span>}
                {repo.description && <span className="hidden max-w-[52ch] truncate md:inline">{repo.description}</span>}
              </>
            )}
            {url && (
              <>
                <span className="mono">HTTP {url.status}</span>
                {url.rendering && <span>{url.rendering}</span>}
                {url.title && <span className="hidden max-w-[52ch] truncate md:inline">{url.title}</span>}
              </>
            )}
            {!repo && !url && running && <Skeleton className="h-3 w-48" />}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {analysis && analysis.warnings.length > 0 && <Warnings warnings={analysis.warnings} />}
        {url?.githubRepo && (
          <Link to={`/r/${url.githubRepo}`} className="focus-ring hidden items-center gap-1.5 rounded-lg border border-accent px-3 py-1.5 text-xs text-accent hover:bg-accent-soft sm:flex">
            <Icon name="github" size={14} /> Open {url.githubRepo} in repo mode
          </Link>
        )}
        {status === 'done' && source !== 'live' && savedAt && (
          <span className="mono hidden text-[11px] text-faint sm:inline" title={new Date(savedAt).toLocaleString()}>
            {source === 'showcase' ? 'showcase' : 'cached'} · {timeAgo(savedAt)}
          </span>
        )}
        {running ? (
          <button type="button" onClick={onCancel} className="focus-ring flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs text-muted hover:text-text">
            <Icon name="stop" size={13} /> Stop
          </button>
        ) : (
          <button type="button" onClick={onRescan} className="focus-ring flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs text-muted hover:border-line-strong hover:text-text" title="Re-scan the latest commit">
            <Icon name="refresh" size={13} /> Re-scan
          </button>
        )}
        <button
          type="button"
          onClick={onFocus}
          className={`focus-ring hidden items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs sm:flex ${focusMode ? 'border-accent text-accent' : 'border-line text-muted hover:text-text'}`}
          title="Focus mode: fade everything not connected to the selection (F)"
        >
          <Icon name="focus" size={13} /> Focus
        </button>
        <button type="button" onClick={onShare} disabled={!analysis} className="focus-ring flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-medium text-accent-ink disabled:opacity-50">
          <Icon name="share" size={13} /> Share
        </button>
        {analysis && analysis.summary.health.factors.length > 0 && (
          <div className="hidden md:block" title={`Health ${analysis.summary.health.score}/100`}>
            <HealthRing health={analysis.summary.health} size={44} stroke={4} />
          </div>
        )}
      </div>
    </div>
  );
}

function Warnings({ warnings }: { warnings: string[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div data-no-export className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} className="focus-ring flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs text-warn hover:border-line-strong">
        <Icon name="alert" size={13} /> {warnings.length} note{warnings.length > 1 ? 's' : ''}
        <Icon name="chevronDown" size={12} className={open ? 'rotate-180' : ''} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.ul initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="glass absolute right-0 top-full z-50 mt-2 w-[min(480px,90vw)] space-y-2 rounded-xl p-3 text-xs text-muted shadow-2xl" style={{ background: 'var(--panel-solid)' }}>
            {warnings.map((w) => (
              <li key={w} className="flex gap-2"><Icon name="info" size={13} className="mt-0.5 shrink-0 text-warn" />{w}</li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

/** One kept-alive view. Memoized: scan-log updates in the page don't re-render views. */
const ViewPane = memo(function ViewPane({ def, active, onEl }: { def: ViewDef; active: boolean; onEl: (el: HTMLElement | null) => void }) {
  const Component = def.component;
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (active) onEl(ref.current);
  }, [active, onEl]);
  // Stable element: toggling `active` re-renders only components that read the context,
  // not the whole view (thousands of treemap rects, table rows, cards…).
  const content = useMemo(
    () => (
      <Suspense fallback={<ViewSkeleton />}>
        <Component />
      </Suspense>
    ),
    [Component],
  );
  return (
    <div
      ref={ref}
      className="absolute inset-0"
      // content-visibility skips style/layout/paint for hidden views but keeps their state
      style={{ visibility: active ? 'visible' : 'hidden', contentVisibility: active ? 'visible' : 'hidden', zIndex: active ? 1 : 0 }}
      aria-hidden={!active}
    >
      <ViewActiveContext.Provider value={active}>{content}</ViewActiveContext.Provider>
    </div>
  );
});

function ViewSkeleton() {
  return (
    <div className="grid gap-4 p-6 md:grid-cols-3">
      <Skeleton className="h-40 md:col-span-1" />
      <Skeleton className="h-40 md:col-span-2" />
      <Skeleton className="h-64 md:col-span-3" />
    </div>
  );
}
