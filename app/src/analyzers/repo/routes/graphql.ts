import { lineAt, lineOf } from '../../../lib/util';
import type { RouteFact } from '../facts';

/** GraphQL operations from SDL: `type Query { users: [User!]! }` (schema files or inline typeDefs). */
const ROOT = /(?:extend\s+)?type\s+(Query|Mutation|Subscription)\s*(?:implements[^{]*)?\{([^}]*)\}/g;

export function extractGraphql(content: string): RouteFact[] {
  if (!/type\s+(Query|Mutation|Subscription)\b/.test(content)) return [];
  const routes: RouteFact[] = [];
  for (const m of content.matchAll(ROOT)) {
    const kind = m[1].toUpperCase();
    const bodyStart = (m.index ?? 0) + m[0].indexOf('{') + 1;
    for (const f of m[2].matchAll(/^\s*(\w+)\s*[(:]/gm)) {
      const line = lineOf(content, bodyStart + (f.index ?? 0) + f[0].indexOf(f[1]));
      routes.push({ method: kind, path: f[1], line, framework: 'GraphQL', snippet: lineAt(content, line) });
    }
  }
  return routes;
}
