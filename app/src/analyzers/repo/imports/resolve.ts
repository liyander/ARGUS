import { dirname, extname, normalizePath, parseJsonc } from '../../../lib/util';
import { packageFromSpecifier } from '../catalog';

export type Resolved = { kind: 'file'; path: string } | { kind: 'files'; paths: string[] } | { kind: 'package'; name: string } | null;

interface TsAlias {
  dir: string;
  baseUrl: string | null;
  paths: [prefix: string, suffix: string, targets: string[]][];
}

const JS_EXTS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts', '.vue', '.svelte', '.astro', '.d.ts'];

/**
 * Turns import specifiers into repo files or package names. Built once per analysis
 * from the full tree, so resolution works even for files that were not downloaded.
 */
export class ImportResolver {
  private files: Set<string>;
  private aliases: TsAlias[] = [];
  private workspaces = new Map<string, string>();
  private packageRoots: string[] = [];
  private goModules: { module: string; root: string }[] = [];
  private pythonRoots: string[] = [''];
  private suffixIndex = new Map<string, string>();
  private filesByDir = new Map<string, string[]>();
  private goDeps: string[] = [];
  private crateRoots: string[] = [];

  constructor(allPaths: string[]) {
    this.files = new Set(allPaths);
    for (const p of allPaths) {
      const d = dirname(p);
      if (!this.filesByDir.has(d)) this.filesByDir.set(d, []);
      this.filesByDir.get(d)!.push(p);
      const ext = extname(p);
      if (ext === '.java' || ext === '.kt' || ext === '.php' || ext === '.scala') {
        const parts = p.slice(0, -ext.length).split('/');
        for (let k = 1; k <= Math.min(5, parts.length); k++) {
          const key = parts.slice(-k).join('/').toLowerCase();
          if (!this.suffixIndex.has(key)) this.suffixIndex.set(key, p);
        }
      }
      if (/(^|\/)(setup\.py|pyproject\.toml)$/.test(p)) {
        const root = dirname(p);
        this.pythonRoots.push(root, root ? `${root}/src` : 'src');
      }
    }
    if (!this.pythonRoots.includes('src')) this.pythonRoots.push('src');
  }

  addTsconfig(path: string, content: string) {
    const json = parseJsonc<{ compilerOptions?: { baseUrl?: string; paths?: Record<string, string[]> } }>(content);
    const co = json?.compilerOptions;
    if (!co || (!co.paths && !co.baseUrl)) return;
    const dir = dirname(path);
    const baseUrl = co.baseUrl !== undefined ? normalizePath(`${dir}/${co.baseUrl}`) : null;
    const root = baseUrl ?? dir;
    const paths: TsAlias['paths'] = [];
    for (const [pattern, targets] of Object.entries(co.paths ?? {})) {
      const star = pattern.indexOf('*');
      const prefix = star === -1 ? pattern : pattern.slice(0, star);
      const suffix = star === -1 ? '' : pattern.slice(star + 1);
      paths.push([prefix, star === -1 ? '\0exact' : suffix, targets.map((t) => normalizePath(`${root}/${t}`))]);
    }
    paths.sort((a, b) => b[0].length - a[0].length);
    this.aliases.push({ dir, baseUrl, paths });
    this.aliases.sort((a, b) => b.dir.length - a.dir.length);
  }

  addWorkspacePackage(name: string, manifestPath: string) {
    const dir = dirname(manifestPath);
    if (name && !this.workspaces.has(name)) this.workspaces.set(name, dir);
    this.packageRoots.push(dir);
    this.packageRoots.sort((a, b) => b.length - a.length);
  }

  addGoModule(module: string, manifestPath: string, deps: string[]) {
    this.goModules.push({ module, root: dirname(manifestPath) });
    this.goModules.sort((a, b) => b.module.length - a.module.length);
    this.goDeps.push(...deps);
    this.goDeps.sort((a, b) => b.length - a.length);
  }

  private tryJsFile(base: string): string | null {
    if (this.files.has(base)) return base;
    for (const e of JS_EXTS) if (this.files.has(base + e)) return base + e;
    for (const e of JS_EXTS) if (this.files.has(`${base}/index${e}`)) return `${base}/index${e}`;
    // TS ESM: import './x.js' that is really x.ts
    const m = base.match(/^(.*)\.(m|c)?js$/);
    if (m) for (const e of ['.ts', '.tsx', '.mts', '.cts']) if (this.files.has(m[1] + e)) return m[1] + e;
    return null;
  }

  private packageRootOf(from: string): string {
    return this.packageRoots.find((r) => r === '' || from.startsWith(r + '/')) ?? '';
  }

  addCrate(manifestPath: string) {
    this.crateRoots.push(dirname(manifestPath));
    this.crateRoots.sort((a, b) => b.length - a.length);
  }

  resolve(from: string, spec: string): Resolved {
    const ext = extname(from);
    if (['.c', '.h', '.cc', '.cpp', '.cxx', '.hpp', '.hh'].includes(ext)) return this.resolveC(from, spec);
    if (ext === '.rs') return this.resolveRust(from, spec);
    if (ext === '.py') return this.resolvePython(from, spec);
    if (ext === '.go') return this.resolveGo(spec);
    if (ext === '.java' || ext === '.kt' || ext === '.php' || ext === '.scala') return this.resolveBySuffix(spec);
    if (ext === '.rb') {
      if (spec.startsWith('.')) {
        const base = normalizePath(`${dirname(from)}/${spec}`);
        const hit = this.files.has(base) ? base : this.files.has(base + '.rb') ? base + '.rb' : null;
        return hit ? { kind: 'file', path: hit } : null;
      }
      return { kind: 'package', name: spec.split('/')[0] };
    }
    return this.resolveJs(from, spec);
  }

  resolveJs(from: string, spec: string): Resolved {
    if (spec.startsWith('.') || spec.startsWith('/')) {
      const base = spec.startsWith('/') ? normalizePath(spec) : normalizePath(`${dirname(from)}/${spec}`);
      const hit = this.tryJsFile(base);
      return hit ? { kind: 'file', path: hit } : null;
    }
    // tsconfig paths, nearest config first
    for (const alias of this.aliases) {
      if (alias.dir && !from.startsWith(alias.dir + '/')) continue;
      for (const [prefix, suffix, targets] of alias.paths) {
        if (suffix === '\0exact' ? spec !== prefix : !spec.startsWith(prefix)) continue;
        const middle = suffix === '\0exact' ? '' : spec.slice(prefix.length, spec.length - suffix.length);
        for (const t of targets) {
          const hit = this.tryJsFile(t.replace('*', middle));
          if (hit) return { kind: 'file', path: hit };
        }
      }
      if (alias.baseUrl !== null) {
        const hit = this.tryJsFile(normalizePath(`${alias.baseUrl}/${spec}`));
        if (hit) return { kind: 'file', path: hit };
      }
    }
    // common conventions without tsconfig: '@/x' and '~/x'
    const conv = spec.match(/^[@~]\/(.*)$/);
    if (conv) {
      const root = this.packageRootOf(from);
      for (const base of [`${root}/src/${conv[1]}`, `${root}/${conv[1]}`, `${root}/app/${conv[1]}`]) {
        const hit = this.tryJsFile(normalizePath(base));
        if (hit) return { kind: 'file', path: hit };
      }
    }
    const pkg = packageFromSpecifier(spec);
    if (!pkg) return null;
    // monorepo workspace package
    const wsDir = this.workspaces.get(pkg);
    if (wsDir !== undefined) {
      const sub = spec.slice(pkg.length).replace(/^\//, '');
      const candidates = sub
        ? [`${wsDir}/src/${sub}`, `${wsDir}/${sub}`]
        : [`${wsDir}/src/index`, `${wsDir}/index`, `${wsDir}/src/main`, `${wsDir}/lib/index`, `${wsDir}/src`];
      for (const c of candidates) {
        const hit = this.tryJsFile(normalizePath(c));
        if (hit) return { kind: 'file', path: hit };
      }
    }
    return { kind: 'package', name: pkg };
  }

  resolvePython(from: string, spec: string): Resolved {
    const tryModule = (base: string): string | null => {
      if (this.files.has(`${base}.py`)) return `${base}.py`;
      if (this.files.has(`${base}/__init__.py`)) return `${base}/__init__.py`;
      return null;
    };
    const dots = spec.match(/^\.+/)?.[0].length ?? 0;
    if (dots > 0) {
      let dir = dirname(from);
      for (let i = 1; i < dots; i++) dir = dirname(dir);
      const rest = spec.slice(dots).replace(/\./g, '/');
      const hit = tryModule(normalizePath(rest ? `${dir}/${rest}` : dir));
      return hit ? { kind: 'file', path: hit } : null;
    }
    const rel = spec.replace(/\./g, '/');
    for (const root of this.pythonRoots) {
      const hit = tryModule(normalizePath(root ? `${root}/${rel}` : rel));
      if (hit) return { kind: 'file', path: hit };
    }
    // also try relative to the importing file's top-level package dir (Django apps)
    const top = from.split('/')[0];
    if (from.includes('/')) {
      const hit = tryModule(normalizePath(`${top}/${rel}`));
      if (hit) return { kind: 'file', path: hit };
    }
    return { kind: 'package', name: spec.split('.')[0].toLowerCase().replace(/_/g, '-') };
  }

  resolveGo(spec: string): Resolved {
    for (const { module, root } of this.goModules) {
      if (spec === module || spec.startsWith(module + '/')) {
        const dir = normalizePath(`${root}/${spec.slice(module.length + 1)}`);
        const files = (this.filesByDir.get(dir) ?? []).filter((f) => f.endsWith('.go') && !f.endsWith('_test.go'));
        return files.length ? { kind: 'files', paths: files.slice(0, 12) } : null;
      }
    }
    const dep = this.goDeps.find((d) => spec === d || spec.startsWith(d + '/'));
    if (dep) return { kind: 'package', name: dep };
    if (!spec.includes('.')) return null; // standard library
    return { kind: 'package', name: spec.split('/').slice(0, 3).join('/') };
  }

  resolveC(from: string, spec: string): Resolved {
    const system = spec.startsWith('<');
    const p = system ? spec.slice(1) : spec;
    const candidates = system ? [`include/${p}`, p] : [`${dirname(from)}/${p}`, `include/${p}`, p];
    for (const c of candidates) {
      const n = normalizePath(c);
      if (this.files.has(n)) return { kind: 'file', path: n };
    }
    return null; // libc / system headers
  }

  resolveRust(from: string, spec: string): Resolved {
    const tryMod = (base: string): string | null => {
      for (const c of [`${base}.rs`, `${base}/mod.rs`]) if (this.files.has(normalizePath(c))) return normalizePath(c);
      return null;
    };
    const dir = dirname(from);
    const name = from.split('/').pop()!;
    const modDir = /^(mod|lib|main)\.rs$/.test(name) ? dir : `${dir}/${name.replace(/\.rs$/, '')}`;
    if (spec.startsWith('mod:')) {
      const hit = tryMod(`${modDir}/${spec.slice(4)}`);
      return hit ? { kind: 'file', path: hit } : null;
    }
    const [head, ...rest] = spec.split('::');
    let base: string | null = null;
    if (head === 'crate') {
      const root = this.crateRoots.find((r) => r === '' || from.startsWith(r + '/')) ?? '';
      base = root ? `${root}/src` : 'src';
    } else if (head === 'super') base = dirname(modDir);
    else if (head === 'self') base = modDir;
    if (base === null) return { kind: 'package', name: head.replace(/_/g, '-') };
    for (let k = rest.length; k > 0; k--) {
      const hit = tryMod(`${base}/${rest.slice(0, k).join('/')}`);
      if (hit) return { kind: 'file', path: hit };
    }
    return null;
  }

  resolveBySuffix(spec: string): Resolved {
    const parts = spec.split(/[.\\]/).filter(Boolean);
    for (let k = Math.min(5, parts.length); k >= 2; k--) {
      const hit = this.suffixIndex.get(parts.slice(-k).join('/').toLowerCase());
      if (hit) return { kind: 'file', path: hit };
    }
    return { kind: 'package', name: parts.slice(0, 2).join('.') };
  }
}
