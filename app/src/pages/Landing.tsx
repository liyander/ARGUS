import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnalyzeInput } from '../components/AnalyzeInput';
import { scoreColor } from '../components/HealthRing';
import { Icon } from '../components/Icon';
import { MiniGalaxy } from '../components/MiniGalaxy';
import { listRecent, type RecentEntry } from '../core/cache';
import type { Analysis } from '../core/model';
import { routeFor } from '../core/pipeline';
import { loadShowcase, showcaseIndex, type ShowcaseEntry } from '../core/showcase';
import { compact, timeAgo } from '../lib/util';

export function Landing() {
  const [showcase, setShowcase] = useState<ShowcaseEntry[]>([]);
  const [demo, setDemo] = useState<Analysis | null>(null);
  const [recent, setRecent] = useState<RecentEntry[]>([]);

  useEffect(() => {
    showcaseIndex().then((list) => {
      setShowcase(list);
      const hero = list.find((e) => e.target === 'vercel/next.js') ?? list[0];
      if (hero) loadShowcase(hero.target).then(setDemo);
    });
    listRecent().then(setRecent);
  }, []);

  return (
    <div className="relative flex-1">
      <section className="relative mx-auto flex max-w-5xl flex-col items-center px-4 pb-6 pt-10 text-center sm:pt-16">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mono mb-5 inline-flex items-center gap-2 rounded-full border border-line bg-panel px-3 py-1 text-[11px] text-muted">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ok" /> runs in your browser · no sign-up · public repos & sites
        </motion.div>
        <motion.h1 initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="text-balance text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
          X-ray any codebase <span className="text-faint">or website.</span>
        </motion.h1>
        <motion.p initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mt-4 max-w-2xl text-balance text-base text-muted sm:text-lg">
          See the stack, the endpoints, and the architecture as one living map. Every claim links to the exact file line or header it came from.
        </motion.p>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="mt-8 w-full max-w-2xl">
          <AnalyzeInput autoFocus />
          <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5 text-xs text-faint">
            try
            {['vercel/next.js', 'expressjs/express', 'fastapi/full-stack-fastapi-template', 'gin-gonic/gin', 'github.com'].map((t) => (
              <Link key={t} to={routeFor(t.includes('/') ? { mode: 'repo', target: t } : { mode: 'url', target: `https://${t}` })} className="mono rounded-md border border-line px-2 py-0.5 text-muted transition hover:border-accent hover:text-accent">
                {t}
              </Link>
            ))}
            <span className="hidden sm:inline">· press <span className="kbd">/</span> to type</span>
          </div>
        </motion.div>
      </section>

      <section className="relative mx-auto max-w-6xl px-4">
        <div className="relative h-[300px] overflow-hidden sm:h-[420px]">
          <MiniGalaxy analysis={demo} />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24" style={{ background: 'linear-gradient(transparent, var(--bg))' }} />
          {demo && (
            <Link to={`/r/${demo.target}?view=galaxy`} className="glass glass-hover absolute bottom-6 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full px-3 py-1.5 text-xs text-muted">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              live: <span className="mono text-text">{demo.target}</span> · {compact(demo.summary.counts.filesAnalyzed ?? 0)} files as stars
              <Icon name="arrowRight" size={12} />
            </Link>
          )}
        </div>
      </section>

      {recent.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 pt-6">
          <h2 className="mono mb-3 text-[11px] uppercase tracking-wider text-faint">Your recent scans</h2>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {recent.slice(0, 10).map((r) => (
              <Link key={r.key} to={routeFor({ mode: r.mode, target: r.target })} className="glass glass-hover flex shrink-0 items-center gap-3 rounded-xl px-3 py-2">
                <span className="text-lg font-semibold tabular-nums" style={{ color: scoreColor(r.score) }}>{r.score}</span>
                <span className="min-w-0">
                  <span className="mono block max-w-[220px] truncate text-sm">{r.label}</span>
                  <span className="block text-[11px] text-faint">{timeAgo(r.savedAt)}</span>
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {showcase.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 pt-10">
          <div className="mb-4 flex items-end justify-between">
            <div>
              <h2 className="text-xl font-semibold">Showcase</h2>
              <p className="text-sm text-muted">Famous repos, pre-analyzed. Opens instantly, no rate limits.</p>
            </div>
            <Link to="/gallery" className="text-sm text-accent hover:underline">All {showcase.length} →</Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {showcase.slice(0, 6).map((e, i) => <ShowcaseCard key={e.slug} entry={e} index={i} />)}
          </div>
        </section>
      )}

      <section className="mx-auto grid max-w-6xl gap-3 px-4 py-14 md:grid-cols-3">
        {[
          ['github', 'Repo mode', 'Reads real source in your browser: manifests, routes, imports, Docker and CI. Two GitHub API calls per repo; files come from raw.githubusercontent.com.'],
          ['globe', 'URL mode', 'Passive look at what a site serves to every visitor: headers, frameworks, bundles, third parties, DNS. Nothing is probed or brute-forced.'],
          ['shield', 'Evidence, not vibes', 'Every node carries a confidence label and the evidence behind it. Click anything to see the file line, header or DNS record.'],
        ].map(([icon, title, body]) => (
          <div key={title} className="glass rounded-2xl p-5">
            <Icon name={icon} size={20} className="text-accent" />
            <h3 className="mt-3 font-medium">{title}</h3>
            <p className="mt-1.5 text-sm text-muted">{body}</p>
          </div>
        ))}
      </section>
      <footer className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 border-t border-line px-4 py-6 text-xs text-faint">
        <span>Stackscope — for analyzing public information and your own projects.</span>
        <Link to="/about" className="hover:text-text">How it works</Link>
        <Link to="/terms" className="hover:text-text">Terms</Link>
      </footer>
    </div>
  );
}

export function ShowcaseCard({ entry, index = 0 }: { entry: ShowcaseEntry; index?: number }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: index * 0.04 }}>
      <Link to={`/r/${entry.target}`} className="glass glass-hover block h-full rounded-2xl p-4">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="mono truncate text-sm font-medium">{entry.target}</div>
            <div className="mt-1 line-clamp-2 text-xs text-muted">{entry.description ?? ' '}</div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-semibold tabular-nums leading-none" style={{ color: scoreColor(entry.score) }}>{entry.score}</div>
            <div className="mono mt-1 text-[10px] text-faint">health</div>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-1">
          {entry.stack.slice(0, 5).map((s) => <span key={s} className="mono rounded border border-line px-1.5 py-0.5 text-[10px] text-muted">{s}</span>)}
        </div>
        <div className="mono mt-3 flex gap-3 text-[11px] text-faint">
          <span>★ {compact(entry.stars)}</span>
          <span>{compact(entry.counts.files ?? 0)} files</span>
          <span>{compact(entry.counts.endpoints ?? 0)} endpoints</span>
          <span>{compact(entry.counts.dependencies ?? 0)} deps</span>
        </div>
      </Link>
    </motion.div>
  );
}
