/** Run `fn` over `items` with at most `limit` in flight. Results keep input order. */
export async function pool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
  signal?: AbortSignal,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat('en-US').format(n);
}

export function compact(n: number): string {
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return 'unknown';
  const days = (Date.now() - new Date(iso).getTime()) / 86_400_000;
  if (days < 1) return 'today';
  if (days < 31) return `${Math.round(days)}d ago`;
  if (days < 365) return `${Math.round(days / 30)}mo ago`;
  return `${(days / 365).toFixed(1)}y ago`;
}

export function basename(path: string): string {
  const i = path.lastIndexOf('/');
  return i === -1 ? path : path.slice(i + 1);
}

export function dirname(path: string): string {
  const i = path.lastIndexOf('/');
  return i === -1 ? '' : path.slice(0, i);
}

export function extname(path: string): string {
  const b = basename(path);
  const i = b.lastIndexOf('.');
  return i <= 0 ? '' : b.slice(i).toLowerCase();
}

/** Normalize `a/./b/../c` style paths (no leading slash). */
export function normalizePath(path: string): string {
  const out: string[] = [];
  for (const part of path.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') out.pop();
    else out.push(part);
  }
  return out.join('/');
}

export function uniq<T>(items: T[]): T[] {
  return [...new Set(items)];
}

export function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export const LANGUAGE_BY_EXT: Record<string, string> = {
  '.ts': 'TypeScript', '.tsx': 'TypeScript', '.mts': 'TypeScript', '.cts': 'TypeScript',
  '.js': 'JavaScript', '.jsx': 'JavaScript', '.mjs': 'JavaScript', '.cjs': 'JavaScript',
  '.vue': 'Vue', '.svelte': 'Svelte', '.astro': 'Astro',
  '.py': 'Python', '.pyi': 'Python',
  '.go': 'Go', '.rs': 'Rust', '.java': 'Java', '.kt': 'Kotlin', '.kts': 'Kotlin', '.scala': 'Scala',
  '.rb': 'Ruby', '.php': 'PHP', '.cs': 'C#', '.fs': 'F#', '.swift': 'Swift', '.m': 'Objective-C',
  '.c': 'C', '.h': 'C', '.cc': 'C++', '.cpp': 'C++', '.hpp': 'C++', '.cxx': 'C++',
  '.dart': 'Dart', '.ex': 'Elixir', '.exs': 'Elixir', '.erl': 'Erlang', '.clj': 'Clojure',
  '.hs': 'Haskell', '.lua': 'Lua', '.r': 'R', '.jl': 'Julia', '.zig': 'Zig', '.sol': 'Solidity',
  '.css': 'CSS', '.scss': 'SCSS', '.sass': 'SCSS', '.less': 'Less',
  '.html': 'HTML', '.htm': 'HTML', '.md': 'Markdown', '.mdx': 'MDX',
  '.json': 'JSON', '.yml': 'YAML', '.yaml': 'YAML', '.toml': 'TOML', '.xml': 'XML',
  '.sql': 'SQL', '.graphql': 'GraphQL', '.gql': 'GraphQL', '.prisma': 'Prisma', '.proto': 'Protobuf',
  '.sh': 'Shell', '.bash': 'Shell', '.zsh': 'Shell', '.ps1': 'PowerShell', '.tf': 'HCL', '.hcl': 'HCL',
};

export function languageOf(path: string): string {
  const b = basename(path);
  if (b === 'Dockerfile' || b.startsWith('Dockerfile.')) return 'Docker';
  if (b === 'Makefile') return 'Makefile';
  return LANGUAGE_BY_EXT[extname(path)] ?? 'Other';
}

/** GitHub linguist-ish colours, used by the treemap and language bars. */
export const LANGUAGE_COLORS: Record<string, string> = {
  TypeScript: '#3178c6', JavaScript: '#f1e05a', Vue: '#41b883', Svelte: '#ff3e00', Astro: '#ff5a03',
  Python: '#3572A5', Go: '#00ADD8', Rust: '#dea584', Java: '#b07219', Kotlin: '#A97BFF', Scala: '#c22d40',
  Ruby: '#701516', PHP: '#4F5D95', 'C#': '#178600', 'F#': '#b845fc', Swift: '#F05138', C: '#555555',
  'C++': '#f34b7d', Dart: '#00B4AB', Elixir: '#6e4a7e', Haskell: '#5e5086', Lua: '#000080',
  CSS: '#663399', SCSS: '#c6538c', Less: '#1d365d', HTML: '#e34c26', Markdown: '#083fa1', MDX: '#fcb32c',
  JSON: '#8a8f98', YAML: '#cb171e', TOML: '#9c4221', SQL: '#e38c00', GraphQL: '#e10098', Prisma: '#5a67d8',
  Shell: '#89e051', Docker: '#384d54', HCL: '#844FBA', Protobuf: '#6f8fae', Other: '#4b5568',
};

export function languageColor(lang: string): string {
  return LANGUAGE_COLORS[lang] ?? '#64748b';
}

export function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Deterministic PRNG so layouts are stable between visits. */
export function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Strip comments and trailing commas so tsconfig/jsconfig JSONC parses. */
export function parseJsonc<T = unknown>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    /* fall through */
  }
  let out = '';
  let inStr = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const n = text[i + 1];
    if (inStr) {
      out += c;
      if (c === '\\') out += text[++i] ?? '';
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; out += c; continue; }
    if (c === '/' && n === '/') { while (i < text.length && text[i] !== '\n') i++; out += '\n'; continue; }
    if (c === '/' && n === '*') { i += 2; while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++; i++; continue; }
    out += c;
  }
  out = out.replace(/,(\s*[}\]])/g, '$1');
  try {
    return JSON.parse(out) as T;
  } catch {
    return null;
  }
}

export function lineOf(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}

export function lineAt(text: string, line: number): string {
  return (text.split('\n')[line - 1] ?? '').trim().slice(0, 200);
}
