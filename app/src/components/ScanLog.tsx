import { motion } from 'framer-motion';
import { useEffect, useRef } from 'react';
import type { LogLine } from '../core/model';
import { Icon } from './Icon';

const PREFIX: Record<LogLine['level'], { mark: string; color: string }> = {
  step: { mark: '›', color: 'var(--accent)' },
  info: { mark: '·', color: 'var(--muted)' },
  success: { mark: '✓', color: 'var(--ok)' },
  warn: { mark: '!', color: 'var(--warn)' },
  error: { mark: '✗', color: 'var(--danger)' },
};

/** Terminal-style stream of the real pipeline steps. */
export function ScanLog({ log, running, progress, onClose, compact = false }: { log: LogLine[]; running: boolean; progress: { fraction: number; label: string }; onClose?: () => void; compact?: boolean }) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest' });
  }, [log.length]);
  return (
    <div className={`glass flex flex-col overflow-hidden rounded-2xl shadow-2xl ${running ? 'scanline' : ''}`} style={{ background: 'color-mix(in srgb, var(--panel-solid) 92%, transparent)' }}>
      <div className="flex items-center gap-2 border-b border-line px-3 py-2">
        <Icon name="terminal" size={14} className="text-accent" />
        <span className="mono text-xs text-muted">scan.log</span>
        {running && <span className="mono ml-2 text-[11px] text-faint">{progress.label}</span>}
        <div className="ml-auto flex items-center gap-2">
          {running && <span className="mono text-[11px] text-accent">{Math.round(progress.fraction * 100)}%</span>}
          {onClose && (
            <button type="button" onClick={onClose} className="focus-ring rounded p-0.5 text-faint hover:text-text" aria-label="Hide scan log">
              <Icon name="close" size={14} />
            </button>
          )}
        </div>
      </div>
      <div className="h-0.5 w-full bg-line">
        <motion.div className="h-full bg-accent" animate={{ width: `${progress.fraction * 100}%` }} transition={{ ease: 'easeOut' }} />
      </div>
      <div className={`mono overflow-y-auto px-3 py-2 text-[12px] leading-relaxed ${compact ? 'max-h-44' : 'max-h-72'}`}>
        {log.map((l, i) => (
          <motion.div key={i} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.18 }} className="flex gap-2">
            <span className="w-12 shrink-0 text-right text-faint">{(l.t / 1000).toFixed(2)}s</span>
            <span style={{ color: PREFIX[l.level].color }}>{PREFIX[l.level].mark}</span>
            <span className={l.level === 'step' ? 'text-text' : l.level === 'error' ? 'text-danger' : 'text-muted'}>{l.text}</span>
          </motion.div>
        ))}
        {running && (
          <div className="flex gap-2">
            <span className="w-12" />
            <span className="caret text-faint" />
          </div>
        )}
        <div ref={end} />
      </div>
    </div>
  );
}
