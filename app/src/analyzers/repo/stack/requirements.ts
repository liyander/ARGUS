import { findLine, readToml, unquote, type DeclaredDep, type ManifestParser } from './types';

const REQ_LINE = /^\s*([A-Za-z0-9][A-Za-z0-9._-]*)(\[[^\]]*\])?\s*([<>=!~^][^;#]*)?/;

function fromSpecLines(path: string, content: string, lines: string[], dev: boolean): DeclaredDep[] {
  const deps: DeclaredDep[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith('-') || line.includes('://')) continue;
    const m = line.match(REQ_LINE);
    if (!m) continue;
    deps.push({
      name: m[1].toLowerCase(),
      spec: (m[3] ?? '*').trim(),
      ecosystem: 'PyPI',
      dev,
      manifest: path,
      line: findLine(content, m[1]),
    });
  }
  return deps;
}

function tomlArray(value: string | undefined): string[] {
  if (!value) return [];
  return [...value.matchAll(/"([^"]+)"|'([^']+)'/g)].map((m) => m[1] ?? m[2]);
}

function specFromValue(v: string): string {
  return v.startsWith('{') ? (v.match(/version\s*=\s*"([^"]+)"/)?.[1] ?? '*') : unquote(v);
}

export const requirements: ManifestParser = {
  match: (name) => name === 'requirements.txt' || /^requirements[-_.][\w.-]*\.txt$/.test(name),
  parse(path, content) {
    const dev = /dev|test|lint|doc/i.test(path);
    return { ecosystem: 'PyPI', manifest: path, deps: fromSpecLines(path, content, content.split('\n'), dev), languageHint: 'Python' };
  },
};

export const pyproject: ManifestParser = {
  match: (name) => name === 'pyproject.toml',
  parse(path, content) {
    const toml = readToml(content);
    const deps: DeclaredDep[] = [];
    const project = toml.get('project');
    deps.push(...fromSpecLines(path, content, tomlArray(project?.get('dependencies')), false));
    for (const [section, values] of toml) {
      if (section === 'project.optional-dependencies' || section === 'dependency-groups') {
        for (const v of values.values()) deps.push(...fromSpecLines(path, content, tomlArray(v), true));
      }
      const poetry = section.match(/^tool\.poetry\.(dev-)?(?:group\.[\w-]+\.)?dependencies$/);
      if (poetry) {
        const dev = Boolean(poetry[1]) || section.includes('group.');
        for (const [name, v] of values) {
          if (name === 'python') continue;
          deps.push({ name: name.toLowerCase(), spec: specFromValue(v), ecosystem: 'PyPI', dev, manifest: path, line: findLine(content, name) });
        }
      }
    }
    const name = project?.get('name') ?? toml.get('tool.poetry')?.get('name');
    return { ecosystem: 'PyPI', manifest: path, packageName: name ? unquote(name) : undefined, deps, languageHint: 'Python' };
  },
};

export const pipfile: ManifestParser = {
  match: (name) => name === 'Pipfile',
  parse(path, content) {
    const toml = readToml(content);
    const deps: DeclaredDep[] = [];
    for (const [section, dev] of [['packages', false], ['dev-packages', true]] as const) {
      for (const [name, v] of toml.get(section) ?? []) {
        deps.push({ name: name.toLowerCase(), spec: specFromValue(v), ecosystem: 'PyPI', dev, manifest: path, line: findLine(content, name) });
      }
    }
    return { ecosystem: 'PyPI', manifest: path, deps, languageHint: 'Python' };
  },
};

export const setupPy: ManifestParser = {
  match: (name) => name === 'setup.py' || name === 'setup.cfg',
  parse(path, content) {
    let lines: string[] = [];
    const py = content.match(/install_requires\s*=\s*\[([\s\S]*?)\]/);
    if (py) lines = [...py[1].matchAll(/["']([^"']+)["']/g)].map((m) => m[1]);
    const cfg = content.match(/install_requires\s*=\s*\n((?:[ \t]+.+\n?)+)/);
    if (cfg) lines = cfg[1].split('\n');
    return { ecosystem: 'PyPI', manifest: path, deps: fromSpecLines(path, content, lines, false), languageHint: 'Python' };
  },
};
