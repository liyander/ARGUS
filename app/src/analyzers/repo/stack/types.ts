export type Ecosystem = 'npm' | 'PyPI' | 'Go' | 'Maven' | 'crates.io' | 'RubyGems' | 'Packagist' | 'Pub' | 'Hex';

export interface DeclaredDep {
  name: string;
  /** as written in the manifest, e.g. ^18.2.0 or >=2.0 */
  spec: string;
  ecosystem: Ecosystem;
  dev: boolean;
  manifest: string;
  line: number;
}

export interface ManifestResult {
  ecosystem: Ecosystem;
  manifest: string;
  packageName?: string;
  deps: DeclaredDep[];
  /** workspace globs (npm/yarn/pnpm) */
  workspaces?: string[];
  scripts?: Record<string, string>;
  /** Go module path, used to resolve internal imports */
  goModule?: string;
  languageHint?: string;
}

export interface ManifestParser {
  match: (fileName: string) => boolean;
  parse: (path: string, content: string) => ManifestResult | null;
}

/** Line number of the first occurrence of `needle` (1-based), or 1. */
export function findLine(content: string, needle: string): number {
  const i = content.indexOf(needle);
  if (i < 0) return 1;
  let line = 1;
  for (let k = 0; k < i; k++) if (content.charCodeAt(k) === 10) line++;
  return line;
}

/** Tiny TOML reader: returns `section -> key -> raw value` for the shapes manifests use. */
export function readToml(content: string): Map<string, Map<string, string>> {
  const sections = new Map<string, Map<string, string>>();
  let current = '';
  sections.set(current, new Map());
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/\s+#.*$/, '').trim();
    if (!line || line.startsWith('#')) continue;
    const sec = line.match(/^\[\[?([^\]]+)\]\]?$/);
    if (sec) {
      current = sec[1].trim();
      if (!sections.has(current)) sections.set(current, new Map());
      continue;
    }
    const kv = line.match(/^("?[\w.@/-]+"?)\s*=\s*(.*)$/);
    if (!kv) continue;
    let value = kv[2];
    // multi-line arrays / inline tables
    let depth = (value.match(/[[{]/g)?.length ?? 0) - (value.match(/[\]}]/g)?.length ?? 0);
    while (depth > 0 && i + 1 < lines.length) {
      const next = lines[++i].replace(/\s+#.*$/, '');
      value += '\n' + next;
      depth += (next.match(/[[{]/g)?.length ?? 0) - (next.match(/[\]}]/g)?.length ?? 0);
    }
    sections.get(current)!.set(kv[1].replace(/"/g, ''), value.trim());
  }
  return sections;
}

export function unquote(v: string): string {
  return v.trim().replace(/^["']|["']$/g, '');
}
