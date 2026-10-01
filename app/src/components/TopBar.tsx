import { Link, NavLink, useLocation } from 'react-router-dom';
import { PROJECT_REPO_URL } from '../lib/config';
import { useUi } from '../store/ui';
import { Icon } from './Icon';
import { Logo } from './ui';

export function TopBar() {
  const { theme, toggleTheme, setPalette, setTokenOpen, hasToken } = useUi();
  const { pathname } = useLocation();
  const inWorkspace = pathname.startsWith('/r/') || pathname.startsWith('/u/');
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
  return (
    <header className={`relative z-30 flex h-14 shrink-0 items-center gap-3 px-4 ${inWorkspace ? 'border-b border-line bg-[var(--bg)]/70 backdrop-blur-md' : ''}`}>
      <Link to="/" className="focus-ring flex items-center gap-2 rounded-lg pr-2" aria-label="Stackscope home">
        <Logo />
        <span className="text-[15px] font-semibold tracking-tight">Stackscope</span>
      </Link>
      <nav className="ml-2 hidden items-center gap-1 text-sm sm:flex">
        {[
          ['/gallery', 'Gallery'],
          ['/compare', 'Compare'],
          ['/about', 'How it works'],
        ].map(([to, label]) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => `focus-ring rounded-lg px-2.5 py-1.5 transition ${isActive ? 'text-text' : 'text-muted hover:text-text'}`}
          >
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="ml-auto flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setPalette(true)}
          className="focus-ring hidden items-center gap-2 rounded-lg border border-line px-2.5 py-1.5 text-xs text-muted transition hover:border-line-strong hover:text-text md:flex"
        >
          <Icon name="search" size={14} />
          <span>Jump to…</span>
          <span className="kbd">{isMac ? '⌘' : 'Ctrl'} K</span>
        </button>
        <button
          type="button"
          onClick={() => setTokenOpen(true)}
          title={hasToken ? 'GitHub token active (this tab only)' : 'Add a GitHub token for higher rate limits'}
          className={`focus-ring flex h-8 items-center gap-1.5 rounded-lg px-2 text-xs transition ${hasToken ? 'text-ok' : 'text-muted hover:text-text'}`}
        >
          <Icon name="key" size={15} />
          <span className="hidden lg:inline">{hasToken ? 'Token on' : 'Token'}</span>
        </button>
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
          className="focus-ring flex h-8 w-8 items-center justify-center rounded-lg text-muted transition hover:text-text"
        >
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} />
        </button>
        <a
          href={PROJECT_REPO_URL}
          target="_blank"
          rel="noreferrer"
          aria-label="Source on GitHub"
          className="focus-ring hidden h-8 w-8 items-center justify-center rounded-lg text-muted transition hover:text-text sm:flex"
        >
          <Icon name="github" size={16} />
        </a>
      </div>
    </header>
  );
}
