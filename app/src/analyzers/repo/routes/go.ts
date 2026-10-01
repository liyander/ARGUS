import { lineAt, lineOf } from '../../../lib/util';
import type { RouteFact } from '../facts';

/**
 * Go: net/http (incl. Go 1.22 "GET /path" patterns), Gin, Echo, Fiber, chi, gorilla/mux.
 *   http.HandleFunc("/x", h)   mux.HandleFunc("GET /items/{id}", h)   r.GET("/x", h)   r.Get("/x", h)
 *   r.HandleFunc("/x", h).Methods("POST")
 */
const CALL = /\.(GET|POST|PUT|PATCH|DELETE|OPTIONS|HEAD|Any|Get|Post|Put|Patch|Delete|Options|Head|All|Handle|HandleFunc)\(\s*"([^"]*)"\s*,?\s*([\w.]*)/g;

export function extractGo(content: string): RouteFact[] {
  const routes: RouteFact[] = [];
  for (const m of content.matchAll(CALL)) {
    let [, fn, path] = m;
    const handler = m[3] || undefined;
    let method = fn.toUpperCase();
    if (fn === 'Handle' || fn === 'HandleFunc') {
      const pattern = path.match(/^([A-Z]+)\s+(\S+)$/);
      if (pattern) {
        method = pattern[1];
        path = pattern[2];
      } else {
        const tail = content.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 160);
        method = tail.match(/^[^\n]*?\.Methods\(\s*"(\w+)"/)?.[1] ?? 'ANY';
      }
    }
    if (method === 'ALL') method = 'ANY';
    if (!path.startsWith('/')) continue; // http.Get("https://…") is a client call, not a route
    const line = lineOf(content, m.index ?? 0);
    routes.push({ method, path: path.replace(/\{(\w+)[^}]*\}/g, ':$1'), line, framework: 'Go', handler, snippet: lineAt(content, line) });
  }
  return routes;
}
