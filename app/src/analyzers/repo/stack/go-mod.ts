import type { DeclaredDep, ManifestParser } from './types';

export const goMod: ManifestParser = {
  match: (name) => name === 'go.mod',
  parse(path, content) {
    const deps: DeclaredDep[] = [];
    const module = content.match(/^module\s+(\S+)/m)?.[1];
    let inBlock = false;
    content.split('\n').forEach((raw, i) => {
      const line = raw.trim();
      if (line.startsWith('require (')) { inBlock = true; return; }
      if (inBlock && line === ')') { inBlock = false; return; }
      const m = inBlock
        ? line.match(/^(\S+)\s+(v\S+)(\s*\/\/\s*indirect)?/)
        : line.match(/^require\s+(\S+)\s+(v\S+)(\s*\/\/\s*indirect)?/);
      // indirect requirements are transitive; mark them dev so they rank lower
      if (m) deps.push({ name: m[1], spec: m[2], ecosystem: 'Go', dev: Boolean(m[3]), manifest: path, line: i + 1 });
    });
    return { ecosystem: 'Go', manifest: path, packageName: module, goModule: module, deps, languageHint: 'Go' };
  },
};
