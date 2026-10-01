import { lineAt, lineOf } from '../../../lib/util';
import { joinRoute, type RouteFact } from '../facts';

/**
 * Spring MVC / WebFlux and JAX-RS annotations (Java + Kotlin):
 *   @RequestMapping("/api/users") class …   @GetMapping("/{id}")   @PostMapping
 *   @Path("/users") class …                  @GET @Path("{id}")
 */
const MAPPING = /@(Get|Post|Put|Delete|Patch|Request)Mapping\s*(\(([^)]*)\))?/g;

function annotationPath(args: string | undefined): string {
  if (!args) return '';
  return args.match(/(?:value|path)?\s*=?\s*\[?\s*"([^"]*)"/)?.[1] ?? '';
}

export function extractSpring(content: string): RouteFact[] {
  if (!/@(\w+Mapping|Path)\b/.test(content)) return [];
  const routes: RouteFact[] = [];
  const classIdx = content.search(/\b(class|object|interface)\s+\w+/);

  // class-level prefix: the last @RequestMapping / @Path before the class keyword
  let prefix = '';
  if (classIdx > 0) {
    const head = content.slice(0, classIdx);
    const rm = [...head.matchAll(/@RequestMapping\s*\(([^)]*)\)/g)].pop();
    const jp = [...head.matchAll(/@Path\s*\(\s*"([^"]*)"\s*\)/g)].pop();
    prefix = rm ? annotationPath(rm[1]) : jp?.[1] ?? '';
  }

  for (const m of content.matchAll(MAPPING)) {
    const idx = m.index ?? 0;
    if (idx < classIdx) continue; // class-level mapping
    const line = lineOf(content, idx);
    let method = m[1].toUpperCase();
    if (method === 'REQUEST') method = m[3]?.match(/RequestMethod\.(\w+)/)?.[1] ?? 'ANY';
    const handler = content.slice(idx).match(/\)\s*(?:public|private|protected|suspend|fun|\s)*[\w<>[\],? ]*?\s(\w+)\s*\(/)?.[1];
    routes.push({ method, path: joinRoute(prefix, annotationPath(m[3])), line, framework: 'Spring', handler, snippet: lineAt(content, line) });
  }

  // JAX-RS: @GET followed (within a few lines) by optional @Path("x")
  for (const m of content.matchAll(/@(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\b(?!\w)/g)) {
    const idx = m.index ?? 0;
    if (idx < classIdx) continue;
    const window = content.slice(Math.max(0, idx - 200), idx + 200);
    const sub = window.match(/@Path\s*\(\s*"([^"]*)"\s*\)/)?.[1] ?? '';
    const line = lineOf(content, idx);
    routes.push({ method: m[1], path: joinRoute(prefix, sub), line, framework: 'JAX-RS', snippet: lineAt(content, line) });
  }
  return routes;
}
