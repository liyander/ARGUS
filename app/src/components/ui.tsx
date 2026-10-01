import { animate, useInView, useReducedMotion } from 'framer-motion';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Confidence, Layer } from '../core/model';
import { LAYER_LABELS } from '../analyzers/repo/catalog';
import { useUi } from '../store/ui';
import { Icon } from './Icon';

export const layerVar = (layer?: Layer) => (layer ? `var(--l-${layer})` : 'var(--faint)');

export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <circle cx="16" cy="16" r="10" fill="none" stroke="var(--accent)" strokeWidth="2" />
      <circle cx="16" cy="16" r="3.2" fill="var(--accent)" />
      <circle cx="25" cy="8" r="2.2" fill="var(--l-frontend)" />
      <circle cx="7" cy="24" r="2.2" fill="var(--l-external)" />
      <circle cx="26" cy="22" r="1.6" fill="var(--l-data)" />
    </svg>
  );
}

export function LayerDot({ layer, size = 8 }: { layer?: Layer; size?: number }) {
  return <span className="inline-block shrink-0 rounded-full" style={{ width: size, height: size, background: layerVar(layer), boxShadow: `0 0 8px ${layerVar(layer)}` }} />;
}

export function LayerBadge({ layer }: { layer?: Layer }) {
  if (!layer) return null;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px]" style={{ borderColor: `color-mix(in srgb, ${layerVar(layer)} 40%, transparent)`, color: layerVar(layer) }}>
      <LayerDot layer={layer} size={6} />
      {LAYER_LABELS[layer]}
    </span>
  );
}

const CONF_STYLE: Record<Confidence, { label: string; color: string; dash: boolean }> = {
  confirmed: { label: 'confirmed', color: 'var(--ok)', dash: false },
  likely: { label: 'likely', color: 'var(--warn)', dash: false },
  inferred: { label: 'inferred', color: 'var(--muted)', dash: true },
};

export function ConfidenceBadge({ confidence }: { confidence: Confidence }) {
  const s = CONF_STYLE[confidence];
  return (
    <span
      title={confidence === 'confirmed' ? 'Read directly from source / response' : confidence === 'likely' ? 'Strong signal, not proven' : 'Inferred from indirect signals'}
      className="mono inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] uppercase tracking-wide"
      style={{ color: s.color, borderColor: `color-mix(in srgb, ${s.color} 45%, transparent)`, borderStyle: s.dash ? 'dashed' : 'solid' }}
    >
      {s.label}
    </span>
  );
}

const METHOD_COLORS: Record<string, string> = {
  GET: 'var(--l-api)', POST: 'var(--ok)', PUT: 'var(--warn)', PATCH: 'var(--l-data)', DELETE: 'var(--danger)',
  ANY: 'var(--muted)', PAGE: 'var(--l-frontend)', QUERY: 'var(--l-external)', MUTATION: 'var(--l-external)', SUBSCRIPTION: 'var(--l-external)', WS: 'var(--lime)',
};

export function MethodBadge({ method }: { method: string }) {
  const c = METHOD_COLORS[method] ?? 'var(--muted)';
  return (
    <span className="mono inline-block min-w-[52px] rounded px-1.5 py-0.5 text-center text-[10px] font-semibold" style={{ color: c, background: `color-mix(in srgb, ${c} 14%, transparent)` }}>
      {method === 'SUBSCRIPTION' ? 'SUB' : method === 'MUTATION' ? 'MUTATE' : method}
    </span>
  );
}

/** Technology logo from simple-icons (falls back to a monogram). */
export function TechLogo({ slug, name, size = 18, color }: { slug?: string; name: string; size?: number; color?: string }) {
  const [failed, setFailed] = useState(false);
  const theme = useUi((s) => s.theme);
  if (!slug || failed) {
    return (
      <span className="mono inline-flex shrink-0 items-center justify-center rounded font-semibold" style={{ width: size, height: size, fontSize: size * 0.48, background: 'var(--line)', color: color ?? 'var(--muted)' }}>
        {name.replace(/[^A-Za-z0-9]/g, '').slice(0, 2)}
      </span>
    );
  }
  return (
    <img
      src={`https://cdn.simpleicons.org/${slug}${theme === 'dark' ? '/dbe4f0' : color ? `/${color.replace('#', '')}` : ''}`}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      onError={() => setFailed(true)}
      className="shrink-0"
      style={{ width: size, height: size }}
    />
  );
}

const defaultFormat = (n: number) => Math.round(n).toLocaleString('en-US');

/** Number that counts up when it enters the viewport. */
export function CountUp({ value, duration = 1.1, format = defaultFormat }: { value: number; duration?: number; format?: (n: number) => string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const reduce = useReducedMotion();
  const shown = useRef(0);
  const formatRef = useRef(format);
  formatRef.current = format;
  useEffect(() => {
    const el = ref.current;
    if (!inView || !el) return;
    const fmt = formatRef.current;
    if (reduce || shown.current === value) {
      shown.current = value;
      el.textContent = fmt(value);
      return;
    }
    const controls = animate(shown.current, value, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => {
        shown.current = v;
        el.textContent = fmt(v);
      },
      onComplete: () => {
        shown.current = value;
        el.textContent = fmt(value);
      },
    });
    return () => controls.stop();
  }, [value, inView, reduce, duration]);
  return <span ref={ref}>{format(0)}</span>;
}

export function Panel({ children, className = '', title, actions }: { children: ReactNode; className?: string; title?: ReactNode; actions?: ReactNode }) {
  return (
    <section className={`glass rounded-2xl ${className}`}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <h3 className="text-sm font-medium text-muted">{title}</h3>
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

export function EmptyState({ icon = 'info', title, children, action }: { icon?: string; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-line bg-panel text-accent">
        <Icon name={icon} size={22} />
      </div>
      <div className="text-base font-medium">{title}</div>
      {children && <div className="max-w-md text-sm text-muted">{children}</div>}
      {action}
    </div>
  );
}

export function Chip({ active, onClick, children, color }: { active?: boolean; onClick?: () => void; children: ReactNode; color?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`focus-ring inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition ${active ? 'border-accent bg-accent-soft text-text' : 'border-line text-muted hover:border-line-strong hover:text-text'}`}
      style={active && color ? { borderColor: color, background: `color-mix(in srgb, ${color} 14%, transparent)` } : undefined}
    >
      {children}
    </button>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton ${className}`} />;
}
