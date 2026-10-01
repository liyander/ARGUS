import { useEffect, useState } from 'react';
import { badgeMarkdown, download, exportJson, exportViewPng, fileStem, renderShareCard, titleOf, toMarkdown } from '../lib/export';
import { SITE_URL } from '../lib/config';
import { useAnalysis } from '../store/analysis';
import { useUi } from '../store/ui';
import { Icon } from './Icon';
import { Modal } from './Modal';

/** Share card, stable link, README badge, and exports (PNG of view, Markdown, JSON). */
export function ShareDialog() {
  const { shareOpen, setShareOpen, viewEl } = useUi();
  const analysis = useAnalysis((s) => s.analysis);
  const [card, setCard] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const link = typeof location !== 'undefined' ? location.href : SITE_URL;

  useEffect(() => {
    if (!shareOpen || !analysis) return;
    let alive = true;
    renderShareCard(analysis, link.split('?')[0]).then((c) => alive && setCard(c.toDataURL('image/png')));
    return () => {
      alive = false;
      setCard(null);
    };
  }, [shareOpen, analysis, link]);

  if (!analysis) return null;
  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      /* clipboard blocked */
    }
  };
  const c = analysis.summary.counts;
  const tweet = `${titleOf(analysis)}: ${analysis.mode === 'repo' ? `${c.files ?? 0} files, ${c.endpoints ?? 0} endpoints, ` : `${c.thirdParties ?? 0} third parties, `}health ${analysis.summary.health.score}. Mapped with Stackscope`;
  const repoName = analysis.context.repo?.fullName;
  const btn = 'focus-ring flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm text-muted transition hover:border-line-strong hover:text-text';

  return (
    <Modal open={shareOpen} onClose={() => setShareOpen(false)} width={640} label="Share and export">
      <div className="p-5">
        <div className="mb-4 flex items-center gap-2 text-base font-medium">
          <Icon name="share" className="text-accent" /> Share & export
        </div>
        <div className="overflow-hidden rounded-xl border border-line bg-bg-2" style={{ aspectRatio: '1200 / 630' }}>
          {card ? <img src={card} alt="Share card preview" className="h-full w-full" /> : <div className="skeleton h-full w-full" />}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className={btn} disabled={!card} onClick={() => card && fetch(card).then((r) => r.blob()).then((b) => download(`${fileStem(analysis)}-card.png`, b))}>
            <Icon name="image" size={15} /> Download card
          </button>
          <button type="button" className={btn} onClick={() => copy('link', link)}>
            <Icon name={copied === 'link' ? 'check' : 'copy'} size={15} /> {copied === 'link' ? 'Copied' : 'Copy link'}
          </button>
          <a className={btn} target="_blank" rel="noreferrer" href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(tweet)}&url=${encodeURIComponent(link)}`}>
            Post on X
          </a>
          <a className={btn} target="_blank" rel="noreferrer" href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(link)}`}>
            LinkedIn
          </a>
        </div>

        <div className="mt-5 mono text-[11px] uppercase tracking-wider text-faint">Export</div>
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            className={btn}
            disabled={!viewEl || busy}
            onClick={async () => {
              if (!viewEl) return;
              setBusy(true);
              try {
                await exportViewPng(viewEl, `${fileStem(analysis)}-view`);
              } finally {
                setBusy(false);
              }
            }}
          >
            <Icon name="download" size={15} /> {busy ? 'Rendering…' : 'Current view (PNG)'}
          </button>
          <button type="button" className={btn} onClick={() => download(`${fileStem(analysis)}-report.md`, toMarkdown(analysis, link), 'text/markdown')}>
            <Icon name="file" size={15} /> Markdown report
          </button>
          <button type="button" className={btn} onClick={() => exportJson(analysis)}>
            <Icon name="code" size={15} /> Analysis JSON
          </button>
        </div>

        {repoName && (
          <>
            <div className="mt-5 mono text-[11px] uppercase tracking-wider text-faint">README badge</div>
            <div className="mt-2 flex items-center gap-2 rounded-lg border border-line bg-bg-2 p-2">
              <code className="mono flex-1 truncate text-[11px] text-muted">{badgeMarkdown(SITE_URL, repoName)}</code>
              <button type="button" className="focus-ring rounded-md px-2 py-1 text-xs text-accent hover:bg-accent-soft" onClick={() => copy('badge', badgeMarkdown(SITE_URL, repoName))}>
                {copied === 'badge' ? 'Copied' : 'Copy'}
              </button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
