import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { detectInput, routeFor } from '../core/pipeline';
import { EXAMPLES } from '../lib/config';
import { Icon } from './Icon';

/** Typewriter cycling through example repos and URLs. */
function useTypewriter(words: string[], active: boolean) {
  const [text, setText] = useState('');
  useEffect(() => {
    if (!active) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setText(words[0]);
      return;
    }
    let word = 0;
    let i = 0;
    let deleting = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const w = words[word % words.length];
      if (!deleting) {
        i++;
        setText(w.slice(0, i));
        if (i === w.length) {
          deleting = true;
          timer = setTimeout(tick, 1600);
          return;
        }
        timer = setTimeout(tick, 45 + Math.random() * 50);
      } else {
        i -= 2;
        setText(w.slice(0, Math.max(0, i)));
        if (i <= 0) {
          deleting = false;
          i = 0;
          word++;
          timer = setTimeout(tick, 300);
          return;
        }
        timer = setTimeout(tick, 18);
      }
    };
    timer = setTimeout(tick, 600);
    return () => clearTimeout(timer);
  }, [words, active]);
  return text;
}

export function AnalyzeInput({ size = 'lg', autoFocus = false, onSubmitted }: { size?: 'lg' | 'md'; autoFocus?: boolean; onSubmitted?: () => void }) {
  const [value, setValue] = useState('');
  const [focused, setFocused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const typed = useTypewriter(EXAMPLES, !value && size === 'lg');
  const detected = detectInput(value);

  useEffect(() => {
    if (!autoFocus) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        ref.current?.focus();
      }
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [autoFocus]);

  const submit = (raw = value) => {
    const input = detectInput(raw);
    if (!input) {
      setError('Enter a GitHub repo (owner/name, or a github.com URL) or a website URL.');
      return;
    }
    setError(null);
    onSubmitted?.();
    navigate(routeFor(input));
  };

  const lg = size === 'lg';
  return (
    <div className="w-full">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className={`glass relative flex items-center gap-3 rounded-2xl transition ${lg ? 'px-5 py-4' : 'px-3 py-2'} ${focused ? 'border-accent' : ''}`}
        style={focused ? { boxShadow: 'var(--glow)' } : undefined}
      >
        <Icon name={detected?.mode === 'url' ? 'globe' : 'github'} size={lg ? 22 : 16} className={detected ? 'text-accent' : 'text-faint'} />
        <div className="relative flex-1">
          <input
            ref={ref}
            autoFocus={autoFocus}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setError(null);
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            aria-label="GitHub repository or website URL"
            spellCheck={false}
            autoComplete="off"
            className={`mono w-full bg-transparent outline-none ${lg ? 'text-lg sm:text-xl' : 'text-sm'}`}
          />
          {!value && (
            <div className={`mono pointer-events-none absolute inset-0 flex items-center truncate text-faint ${lg ? 'text-lg sm:text-xl' : 'text-sm'}`}>
              <span className={lg ? 'caret' : ''}>{lg ? typed : 'owner/repo or https://…'}</span>
            </div>
          )}
        </div>
        <AnimatePresence>
          {detected && (
            <motion.span
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="mono hidden rounded-md border border-line px-2 py-1 text-[11px] uppercase tracking-wider text-muted sm:inline"
            >
              {detected.mode === 'repo' ? 'repo mode' : 'url mode'}
            </motion.span>
          )}
        </AnimatePresence>
        <button
          type="submit"
          className={`focus-ring flex items-center gap-2 rounded-xl bg-accent font-medium text-accent-ink transition hover:brightness-110 ${lg ? 'px-4 py-2.5' : 'px-3 py-1.5 text-sm'}`}
        >
          {lg ? 'Scan' : 'Go'} <Icon name="arrowRight" size={lg ? 18 : 14} />
        </button>
      </form>
      {error && <div className="mt-2 text-sm text-danger">{error}</div>}
    </div>
  );
}
