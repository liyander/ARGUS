import { lineAt, lineOf } from '../../../lib/util';
import { joinRoute, type RouteFact } from '../facts';

/**
 * Flask + FastAPI (+ Starlette/Quart/Sanic-style) decorators:
 *   @app.route('/x', methods=['GET', 'POST'])   @bp.get('/x')   @router.post("/items/{id}")
 * Prefixes: APIRouter(prefix="/users") and Blueprint(..., url_prefix="/users") in the same file.
 */
const DECORATOR = /^[ \t]*@(\w+)\.(route|get|post|put|patch|delete|options|head|websocket|api_route)\(\s*[rf]?["']([^"']*)["']([^\n]*)/gm;
const PREFIX = /(\w+)\s*=\s*(?:APIRouter|Blueprint)\(([^)]*)\)/g;

export function extractPythonDecoratorRoutes(content: string): RouteFact[] {
  if (!content.includes('@')) return [];
  const prefixes = new Map<string, string>();
  for (const m of content.matchAll(PREFIX)) {
    const p = m[2].match(/(?:url_)?prefix\s*=\s*["']([^"']+)["']/);
    if (p) prefixes.set(m[1], p[1]);
  }
  const routes: RouteFact[] = [];
  for (const m of content.matchAll(DECORATOR)) {
    const [, obj, kind, path, rest] = m;
    const line = lineOf(content, (m.index ?? 0) + m[0].indexOf('@'));
    let methods: string[];
    if (kind === 'route' || kind === 'api_route') {
      const list = rest.match(/methods\s*=\s*[[(]([^\])]*)[\])]/);
      methods = list ? [...list[1].matchAll(/["'](\w+)["']/g)].map((x) => x[1].toUpperCase()) : ['GET'];
    } else {
      methods = [kind === 'websocket' ? 'WS' : kind.toUpperCase()];
    }
    // handler = the next def after the decorator stack
    const after = content.slice((m.index ?? 0) + m[0].length);
    const handler = after.match(/^\s*(?:@[^\n]*\n\s*)*(?:async\s+)?def\s+(\w+)/)?.[1];
    const framework = /\bfastapi\b|APIRouter/.test(content) ? 'FastAPI' : 'Flask';
    for (const method of methods) {
      routes.push({ method, path: joinRoute(prefixes.get(obj) ?? '', path), line, framework, handler, snippet: lineAt(content, line) });
    }
  }
  return routes;
}
