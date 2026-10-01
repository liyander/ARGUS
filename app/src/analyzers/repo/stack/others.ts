import { parseJsonc } from '../../../lib/util';
import { findLine, readToml, unquote, type DeclaredDep, type ManifestParser } from './types';

export const cargo: ManifestParser = {
  match: (name) => name === 'Cargo.toml',
  parse(path, content) {
    const toml = readToml(content);
    const deps: DeclaredDep[] = [];
    for (const [section, values] of toml) {
      const m = section.match(/(^|\.)(dev-|build-)?dependencies$/);
      if (!m) continue;
      for (const [name, v] of values) {
        if (v.includes('path =') && !v.includes('version')) continue; // workspace-local crate
        const spec = v.startsWith('{') ? (v.match(/version\s*=\s*"([^"]+)"/)?.[1] ?? '*') : unquote(v);
        deps.push({ name, spec, ecosystem: 'crates.io', dev: Boolean(m[2]), manifest: path, line: findLine(content, name) });
      }
    }
    const pkgName = toml.get('package')?.get('name');
    return { ecosystem: 'crates.io', manifest: path, packageName: pkgName ? unquote(pkgName) : undefined, deps, languageHint: 'Rust' };
  },
};

export const gemfile: ManifestParser = {
  match: (name) => name === 'Gemfile',
  parse(path, content) {
    const deps: DeclaredDep[] = [];
    let groupDev = false;
    content.split('\n').forEach((raw, i) => {
      const line = raw.trim();
      if (/^group\s+.*:(development|test)/.test(line)) groupDev = true;
      if (line === 'end') groupDev = false;
      const m = line.match(/^gem\s+["']([^"']+)["'](?:\s*,\s*["']([^"']+)["'])?/);
      if (m) deps.push({ name: m[1], spec: m[2] ?? '*', ecosystem: 'RubyGems', dev: groupDev, manifest: path, line: i + 1 });
    });
    return { ecosystem: 'RubyGems', manifest: path, deps, languageHint: 'Ruby' };
  },
};

export const composer: ManifestParser = {
  match: (name) => name === 'composer.json',
  parse(path, content) {
    const pkg = parseJsonc<{ name?: string; require?: Record<string, string>; 'require-dev'?: Record<string, string> }>(content);
    if (!pkg) return null;
    const deps: DeclaredDep[] = [];
    for (const [rec, dev] of [[pkg.require, false], [pkg['require-dev'], true]] as const) {
      for (const [name, spec] of Object.entries(rec ?? {})) {
        if (name === 'php' || name.startsWith('ext-')) continue;
        deps.push({ name, spec, ecosystem: 'Packagist', dev, manifest: path, line: findLine(content, `"${name}"`) });
      }
    }
    return { ecosystem: 'Packagist', manifest: path, packageName: pkg.name, deps, languageHint: 'PHP' };
  },
};

export const maven: ManifestParser = {
  match: (name) => name === 'pom.xml',
  parse(path, content) {
    const props: Record<string, string> = {};
    const propsBlock = content.match(/<properties>([\s\S]*?)<\/properties>/)?.[1] ?? '';
    for (const m of propsBlock.matchAll(/<([\w.-]+)>([^<]*)<\/\1>/g)) props[m[1]] = m[2].trim();
    const deps: DeclaredDep[] = [];
    for (const m of content.matchAll(/<dependency>([\s\S]*?)<\/dependency>/g)) {
      const block = m[1];
      const g = block.match(/<groupId>([^<]+)<\/groupId>/)?.[1]?.trim();
      const a = block.match(/<artifactId>([^<]+)<\/artifactId>/)?.[1]?.trim();
      if (!g || !a) continue;
      let v = block.match(/<version>([^<]+)<\/version>/)?.[1]?.trim() ?? '*';
      v = v.replace(/\$\{([^}]+)\}/, (_, k: string) => props[k] ?? '*');
      const scope = block.match(/<scope>([^<]+)<\/scope>/)?.[1]?.trim();
      deps.push({ name: `${g}:${a}`, spec: v, ecosystem: 'Maven', dev: scope === 'test', manifest: path, line: findLine(content, `<artifactId>${a}</artifactId>`) });
    }
    return { ecosystem: 'Maven', manifest: path, deps, languageHint: 'Java' };
  },
};

export const gradle: ManifestParser = {
  match: (name) => name === 'build.gradle' || name === 'build.gradle.kts',
  parse(path, content) {
    const deps: DeclaredDep[] = [];
    const re = /(implementation|api|compileOnly|runtimeOnly|testImplementation|kapt|ksp|annotationProcessor)\s*\(?\s*["']([\w.-]+):([\w.-]+):?([\w.${}-]*)["']/g;
    for (const m of content.matchAll(re)) {
      deps.push({
        name: `${m[2]}:${m[3]}`,
        spec: m[4] || '*',
        ecosystem: 'Maven',
        dev: m[1].startsWith('test'),
        manifest: path,
        line: findLine(content, m[0]),
      });
    }
    return { ecosystem: 'Maven', manifest: path, deps, languageHint: path.endsWith('.kts') ? 'Kotlin' : 'Java' };
  },
};

export const pubspec: ManifestParser = {
  match: (name) => name === 'pubspec.yaml',
  parse(path, content) {
    const deps: DeclaredDep[] = [];
    let section: 'dependencies' | 'dev_dependencies' | null = null;
    content.split('\n').forEach((raw, i) => {
      if (/^dependencies:/.test(raw)) { section = 'dependencies'; return; }
      if (/^dev_dependencies:/.test(raw)) { section = 'dev_dependencies'; return; }
      if (/^\S/.test(raw)) { section = null; return; }
      const m = raw.match(/^ {2}([\w-]+):\s*(.*)$/);
      if (section && m && m[1] !== 'flutter') {
        deps.push({ name: m[1], spec: unquote(m[2]) || '*', ecosystem: 'Pub', dev: section === 'dev_dependencies', manifest: path, line: i + 1 });
      }
    });
    return { ecosystem: 'Pub', manifest: path, deps, languageHint: 'Dart' };
  },
};
