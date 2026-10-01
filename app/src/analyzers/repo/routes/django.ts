import { lineAt, lineOf } from '../../../lib/util';
import type { MountFact, RouteFact } from '../facts';

/**
 * Django urlpatterns (urls.py):
 *   path('users/<int:pk>/', views.user_detail)      → route
 *   path('api/', include('shop.urls'))               → mount, prefix applied to shop/urls.py
 *   router.register(r'users', UserViewSet)           → DRF viewset routes
 */
const PATH_RE = /\b(re_path|path|url)\(\s*r?["']([^"']*)["']\s*,\s*([^\n]+)/g;

function djangoPath(raw: string, isRegex: boolean): string {
  let p = raw;
  if (isRegex) p = p.replace(/^\^/, '').replace(/\$$/, '').replace(/\(\?P<(\w+)>[^)]*\)/g, ':$1');
  p = p.replace(/<(?:\w+:)?(\w+)>/g, ':$1');
  return '/' + p.replace(/^\//, '');
}

export function extractDjango(path: string, content: string): { routes: RouteFact[]; mounts: MountFact[] } {
  const routes: RouteFact[] = [];
  const mounts: MountFact[] = [];
  if (!/urls\.py$/.test(path) && !content.includes('urlpatterns')) return { routes, mounts };
  for (const m of content.matchAll(PATH_RE)) {
    const [, fn, raw, rest] = m;
    const line = lineOf(content, m.index ?? 0);
    const p = djangoPath(raw, fn !== 'path');
    const include = rest.match(/include\(\s*["']([\w.]+)["']/);
    if (include) {
      mounts.push({ prefix: p, spec: include[1], line });
      continue;
    }
    const handler = rest.match(/^([\w.]+)/)?.[1];
    routes.push({ method: 'ANY', path: p, line, framework: 'Django', handler, snippet: lineAt(content, line) });
  }
  for (const m of content.matchAll(/\b\w+\.register\(\s*r?["']([^"']+)["']\s*,\s*(\w+)/g)) {
    const line = lineOf(content, m.index ?? 0);
    const base = '/' + m[1].replace(/^\^|\$$/g, '').replace(/^\//, '');
    for (const [method, suffix] of [['GET', ''], ['POST', ''], ['GET', '/:pk'], ['PUT', '/:pk'], ['DELETE', '/:pk']]) {
      routes.push({ method, path: base + suffix, line, framework: 'Django REST', handler: m[2], snippet: lineAt(content, line) });
    }
  }
  return { routes, mounts };
}
