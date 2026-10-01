import { lineOf } from '../../../lib/util';
import { emptyFacts, type FileFacts } from '../facts';
import { extractDjango } from '../routes/django';
import { extractPythonDecoratorRoutes } from '../routes/fastapi';

/** Python: `import a.b`, `from .x import y` (relative dots preserved for the resolver). */
export function parsePython(path: string, content: string): FileFacts {
  const facts = emptyFacts(path, content);
  facts.parser = 'regex';
  for (const m of content.matchAll(/^[ \t]*import[ \t]+([\w., \t]+)/gm)) {
    const line = lineOf(content, m.index ?? 0);
    for (const part of m[1].split(',')) {
      const mod = part.trim().split(/\s+as\s+/)[0];
      if (mod) facts.imports.push({ spec: mod, line });
    }
  }
  for (const m of content.matchAll(/^[ \t]*from[ \t]+(\.*[\w.]*)[ \t]+import[ \t]+\(?([\w, \t\n*]+)/gm)) {
    const line = lineOf(content, m.index ?? 0);
    const mod = m[1];
    if (/^\.+$/.test(mod)) {
      // `from . import views` → each name may be a sibling module
      for (const name of m[2].split(',').map((s) => s.trim().split(/\s+as\s+/)[0]).filter((s) => /^\w+$/.test(s))) {
        facts.imports.push({ spec: `${mod}${name}`, line });
      }
    } else {
      facts.imports.push({ spec: mod, line });
    }
  }
  for (const m of content.matchAll(/^(?:async\s+)?def\s+(\w+)|^class\s+(\w+)/gm)) facts.exports.push(m[1] ?? m[2]);
  facts.routes.push(...extractPythonDecoratorRoutes(content));
  const dj = extractDjango(path, content);
  facts.routes.push(...dj.routes);
  facts.mounts.push(...dj.mounts);
  return facts;
}
