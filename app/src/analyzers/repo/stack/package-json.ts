import { parseJsonc } from '../../../lib/util';
import { findLine, type DeclaredDep, type ManifestParser } from './types';

interface PackageJson {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  workspaces?: string[] | { packages?: string[] };
  scripts?: Record<string, string>;
  imports?: Record<string, string>;
}

export const packageJson: ManifestParser = {
  match: (name) => name === 'package.json' || name === 'deno.json' || name === 'deno.jsonc',
  parse(path, content) {
    const pkg = parseJsonc<PackageJson>(content);
    if (!pkg || typeof pkg !== 'object') return null;
    const deps: DeclaredDep[] = [];
    const add = (record: Record<string, string> | undefined, dev: boolean) => {
      for (const [name, spec] of Object.entries(record ?? {})) {
        if (typeof spec !== 'string') continue;
        deps.push({ name, spec, ecosystem: 'npm', dev, manifest: path, line: findLine(content, `"${name}"`) });
      }
    };
    add(pkg.dependencies, false);
    add(pkg.optionalDependencies, false);
    add(pkg.peerDependencies, false);
    add(pkg.devDependencies, true);
    // deno.json import maps: "imports": { "oak": "jsr:@oak/oak@^17" }
    if (pkg.imports && !path.endsWith('package.json')) {
      for (const [alias, target] of Object.entries(pkg.imports)) {
        const m = String(target).match(/^(?:npm|jsr):(@?[^@]+)@?(.*)$/);
        if (m) deps.push({ name: m[1], spec: m[2] || '*', ecosystem: 'npm', dev: false, manifest: path, line: findLine(content, `"${alias}"`) });
      }
    }
    const ws = Array.isArray(pkg.workspaces) ? pkg.workspaces : pkg.workspaces?.packages;
    return {
      ecosystem: 'npm',
      manifest: path,
      packageName: pkg.name,
      deps,
      workspaces: ws,
      scripts: pkg.scripts,
      languageHint: 'JavaScript',
    };
  },
};
