import { Command } from 'cmdk';
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import type { GraphNode } from '../core/model';
import { detectInput, routeFor } from '../core/pipeline';
import { useAnalysis } from '../store/analysis';
import { useUi } from '../store/ui';
import { viewsFor } from '../views/registry';
import { Icon } from './Icon';
import { LayerDot, MethodBadge } from './ui';

const KIND_VIEW: Partial<Record<GraphNode['kind'], string>> = {
  endpoint: 'endpoints',
  dependency: 'dependencies',
  file: 'galaxy',
  thirdParty: 'thirdparties',
};

/** ⌘K: jump to any file, endpoint, package, view or action. */
export function CommandPalette() {
  const { paletteOpen, setPalette, toggleTheme, setTokenOpen, setShareOpen } = useUi();
  const analysis = useAnalysis((s) => s.analysis);
  const select = useAnalysis((s) => s.select);
  const toggleFocus = useAnalysis((s) => s.toggleFocus);
  const navigate = useNavigate();
  const location = useLocation();
  const [, setParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const inWorkspace = location.pathname.startsWith('/r/') || location.pathname.startsWith('/u/');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPalette(!useUi.getState().paletteOpen);
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [setPalette]);

  useEffect(() => {
    if (!paletteOpen) setQuery('');
  }, [paletteOpen]);

  const groups = useMemo(() => {
    if (!analysis || !inWorkspace) return null;
    const by = (k: GraphNode['kind']) => analysis.nodes.filter((n) => n.kind === k);
    return {
      endpoints: by('endpoint').slice(0, 800),
      files: by('file').slice(0, 2000),
      deps: by('dependency'),
      tech: analysis.nodes.filter((n) => ['framework', 'service', 'datastore', 'infra', 'thirdParty', 'module'].includes(n.kind)).slice(0, 600),
    };
  }, [analysis, inWorkspace]);

  const goNode = (n: GraphNode) => {
    select(n.id);
    const view = KIND_VIEW[n.kind];
    setParams((p) => {
      const next = new URLSearchParams(p);
      next.set('node', n.id);
      if (view && (view !== 'galaxy' || analysis?.mode === 'repo')) next.set('view', view);
      return next;
    }, { replace: true });
    setPalette(false);
  };

  const direct = detectInput(query);
  const item = 'flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm aria-selected:bg-accent-soft aria-selected:text-text text-muted';

  if (!paletteOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 px-4 pt-[10vh] backdrop-blur-sm" onMouseDown={(e) => e.target === e.currentTarget && setPalette(false)}>
      <Command
        label="Command palette"
        className="glass w-full max-w-xl overflow-hidden rounded-2xl shadow-2xl"
        style={{ background: 'var(--panel-solid)' }}
        loop
        onKeyDown={(e) => e.key === 'Escape' && setPalette(false)}
      >
        <div className="flex items-center gap-2 border-b border-line px-4">
          <Icon name="search" className="text-faint" />
          <Command.Input
            autoFocus
            value={query}
            onValueChange={setQuery}
            placeholder={analysis && inWorkspace ? 'Search files, endpoints, packages, views…' : 'Type a repo (owner/name) or URL…'}
            className="h-12 flex-1 bg-transparent text-[15px] outline-none placeholder:text-faint"
          />
          <span className="kbd">esc</span>
        </div>
        <Command.List className="max-h-[56vh] overflow-y-auto p-2">
          <Command.Empty className="px-3 py-6 text-center text-sm text-faint">No matches.</Command.Empty>
          {direct && (
            <Command.Group heading="Analyze" className="text-xs text-faint [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5">
              <Command.Item value={`analyze ${query}`} className={item} onSelect={() => { navigate(routeFor(direct)); setPalette(false); }}>
                <Icon name={direct.mode === 'repo' ? 'github' : 'globe'} />
                Analyze <span className="mono text-text">{direct.target.replace(/^https:\/\//, '')}</span>
                <span className="ml-auto text-xs text-faint">{direct.mode === 'repo' ? 'repo mode' : 'URL mode'}</span>
              </Command.Item>
            </Command.Group>
          )}
          {analysis && inWorkspace && (
            <Command.Group heading="Views" className="text-xs text-faint [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5">
              {viewsFor(analysis.mode).map((v) => (
                <Command.Item key={v.id} value={`view ${v.label}`} className={item} onSelect={() => { setParams((p) => { const n = new URLSearchParams(p); n.set('view', v.id); return n; }, { replace: true }); setPalette(false); }}>
                  <Icon name={v.icon} /> {v.label} <span className="kbd ml-auto">{v.key}</span>
                </Command.Item>
              ))}
            </Command.Group>
          )}
          {groups && (
            <>
              <Command.Group heading="Endpoints" className="text-xs text-faint [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5">
                {groups.endpoints.map((n) => (
                  <Command.Item key={n.id} value={`endpoint ${n.label} ${n.meta.file ?? ''}`} className={item} onSelect={() => goNode(n)}>
                    <MethodBadge method={String(n.meta.method)} />
                    <span className="mono truncate text-text">{String(n.meta.path)}</span>
                    <span className="mono ml-auto truncate text-[11px] text-faint">{String(n.meta.file ?? '').split('/').slice(-2).join('/')}</span>
                  </Command.Item>
                ))}
              </Command.Group>
              <Command.Group heading="Technologies" className="text-xs text-faint [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5">
                {groups.tech.map((n) => (
                  <Command.Item key={n.id} value={`tech ${n.label} ${n.meta.category ?? ''}`} className={item} onSelect={() => goNode(n)}>
                    <LayerDot layer={n.layer} /> <span className="text-text">{n.label}</span>
                    <span className="ml-auto text-[11px] text-faint">{String(n.meta.category ?? n.kind)}</span>
                  </Command.Item>
                ))}
              </Command.Group>
              <Command.Group heading="Packages" className="text-xs text-faint [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5">
                {groups.deps.map((n) => (
                  <Command.Item key={n.id} value={`package ${n.label}`} className={item} onSelect={() => goNode(n)}>
                    <Icon name="dependencies" size={14} /> <span className="mono text-text">{n.label}</span>
                    <span className="mono ml-auto text-[11px] text-faint">{String(n.meta.spec ?? '')}</span>
                  </Command.Item>
                ))}
              </Command.Group>
              <Command.Group heading="Files" className="text-xs text-faint [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5">
                {groups.files.map((n) => (
                  <Command.Item key={n.id} value={`file ${n.meta.path}`} className={item} onSelect={() => goNode(n)}>
                    <Icon name="file" size={14} /> <span className="mono truncate text-text">{String(n.meta.path)}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            </>
          )}
          <Command.Group heading="Actions" className="text-xs text-faint [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5">
            {analysis && inWorkspace && (
              <>
                <Command.Item value="share card export" className={item} onSelect={() => { setShareOpen(true); setPalette(false); }}>
                  <Icon name="share" /> Share & export…
                </Command.Item>
                <Command.Item value="focus mode toggle" className={item} onSelect={() => { toggleFocus(); setPalette(false); }}>
                  <Icon name="focus" /> Toggle focus mode <span className="kbd ml-auto">F</span>
                </Command.Item>
              </>
            )}
            <Command.Item value="theme toggle light dark" className={item} onSelect={() => { toggleTheme(); setPalette(false); }}>
              <Icon name="sun" /> Toggle light / dark theme <span className="kbd ml-auto">T</span>
            </Command.Item>
            <Command.Item value="github token rate limit" className={item} onSelect={() => { setTokenOpen(true); setPalette(false); }}>
              <Icon name="key" /> Set GitHub token…
            </Command.Item>
            <Command.Item value="compare repos" className={item} onSelect={() => { navigate('/compare'); setPalette(false); }}>
              <Icon name="compare" /> Compare two projects
            </Command.Item>
            <Command.Item value="gallery showcase" className={item} onSelect={() => { navigate('/gallery'); setPalette(false); }}>
              <Icon name="star" /> Showcase gallery
            </Command.Item>
          </Command.Group>
        </Command.List>
      </Command>
    </div>
  );
}
