import { useEffect, useState } from 'react';
import { Icon } from '../components/Icon';
import { EmptyState } from '../components/ui';
import { showcaseIndex, type ShowcaseEntry } from '../core/showcase';
import { ShowcaseCard } from './Landing';

export default function Gallery() {
  const [entries, setEntries] = useState<ShowcaseEntry[] | null>(null);
  const [q, setQ] = useState('');
  useEffect(() => {
    showcaseIndex().then(setEntries);
  }, []);
  const filtered = (entries ?? []).filter((e) => !q || `${e.target} ${e.description ?? ''} ${e.stack.join(' ')}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">
      <div className="mb-6 flex flex-wrap items-end gap-4">
        <div className="flex-1">
          <h1 className="text-3xl font-semibold">Showcase gallery</h1>
          <p className="mt-1 text-muted">Well-known open-source projects, analyzed nightly by the same pipeline you run in the browser.</p>
        </div>
        <div className="glass flex items-center gap-2 rounded-lg px-3 py-2">
          <Icon name="search" size={14} className="text-faint" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by name or stack…" className="bg-transparent text-sm outline-none" />
        </div>
      </div>
      {entries === null ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }, (_, i) => <div key={i} className="skeleton h-40" />)}</div>
      ) : entries.length === 0 ? (
        <EmptyState icon="star" title="The showcase hasn't been built yet">
          Run <code className="mono text-text">npm run showcase</code> in <code className="mono">app/</code> to pre-analyze the repo list in scripts/showcase-repos.json.
        </EmptyState>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((e, i) => <ShowcaseCard key={e.slug} entry={e} index={i} />)}
        </div>
      )}
    </div>
  );
}
