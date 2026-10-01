import { lineAt, lineOf } from '../../../lib/util';
import { joinRoute, type RouteFact } from '../facts';

/** Rails config/routes.rb: verbs + `resources :users` (expanded to the REST set). */
export function extractRails(path: string, content: string): RouteFact[] {
  if (!/routes\.rb$/.test(path)) return [];
  const routes: RouteFact[] = [];
  for (const m of content.matchAll(/^\s*(get|post|put|patch|delete|match)\s+['"]([^'"]+)['"](?:[^\n]*?to:\s*['"]([^'"]+)['"])?/gm)) {
    const line = lineOf(content, m.index ?? 0);
    routes.push({ method: m[1] === 'match' ? 'ANY' : m[1].toUpperCase(), path: joinRoute('', m[2]), line, framework: 'Rails', handler: m[3], snippet: lineAt(content, line) });
  }
  for (const m of content.matchAll(/^\s*resources?\s+:(\w+)/gm)) {
    const line = lineOf(content, m.index ?? 0);
    const base = `/${m[1]}`;
    for (const [method, suffix] of [['GET', ''], ['POST', ''], ['GET', '/:id'], ['PATCH', '/:id'], ['DELETE', '/:id']]) {
      routes.push({ method, path: base + suffix, line, framework: 'Rails', handler: `${m[1]}#resource`, snippet: lineAt(content, line) });
    }
  }
  return routes;
}

/** Laravel Route:: facade and Symfony #[Route] attributes. */
export function extractPhp(content: string): RouteFact[] {
  const routes: RouteFact[] = [];
  for (const m of content.matchAll(/Route::(get|post|put|patch|delete|any|options)\(\s*['"]([^'"]*)['"]\s*,\s*([^\n;]*)/g)) {
    const line = lineOf(content, m.index ?? 0);
    const handler = m[3].match(/\[?\s*([\w\\]+)::class(?:\s*,\s*['"](\w+)['"])?/);
    routes.push({
      method: m[1] === 'any' ? 'ANY' : m[1].toUpperCase(), path: joinRoute('', m[2]), line, framework: 'Laravel',
      handler: handler ? `${handler[1].split('\\').pop()}${handler[2] ? '@' + handler[2] : ''}` : undefined, snippet: lineAt(content, line),
    });
  }
  for (const m of content.matchAll(/Route::(?:api)?[rR]esource\(\s*['"]([^'"]+)['"]\s*,\s*([\w\\]+)/g)) {
    const line = lineOf(content, m.index ?? 0);
    for (const [method, suffix] of [['GET', ''], ['POST', ''], ['GET', '/{id}'], ['PUT', '/{id}'], ['DELETE', '/{id}']]) {
      routes.push({ method, path: joinRoute('', m[1] + suffix), line, framework: 'Laravel', handler: m[2].split('\\').pop(), snippet: lineAt(content, line) });
    }
  }
  for (const m of content.matchAll(/#\[Route\(\s*['"]([^'"]+)['"]([^\]]*)\]/g)) {
    const line = lineOf(content, m.index ?? 0);
    const methods = m[2].match(/methods:\s*\[([^\]]*)\]/)?.[1].match(/\w+/g) ?? ['ANY'];
    for (const method of methods) routes.push({ method: method.toUpperCase(), path: m[1], line, framework: 'Symfony', snippet: lineAt(content, line) });
  }
  return routes;
}
