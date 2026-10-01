import type { RouteFact } from '../facts';

/**
 * File-system routing: Next.js (pages + app router), SvelteKit, Nuxt, Remix / React Router v7.
 * Works from paths alone; exported names (when the file was parsed) refine the HTTP methods.
 */

export interface FileRoute extends RouteFact {
  file: string;
}

const HTTP = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

function segmentsToPath(segments: string[]): string {
  const out = segments
    .filter((s) => !/^\(.*\)$/.test(s) && !s.startsWith('@') && s !== 'index' && s !== '_index')
    .map((s) =>
      s
        .replace(/^\[\[\.\.\.(\w+)\]\]$/, '*$1?')
        .replace(/^\[\.\.\.(\w+)\]$/, '*$1')
        .replace(/^\[(\w+)\]$/, ':$1')
        .replace(/^\$(\w+)$/, ':$1')
        .replace(/^\$$/, '*'),
    );
  return '/' + out.join('/');
}

export interface FrameworkRoots {
  next: string[];
  sveltekit: string[];
  nuxt: string[];
  remix: string[];
}

function under(path: string, roots: string[]): string | null {
  for (const root of roots) {
    if (root === '') return path;
    if (path.startsWith(root + '/')) return path.slice(root.length + 1);
  }
  return null;
}

export function extractFileRoutes(paths: string[], roots: FrameworkRoots, exportsOf: (path: string) => string[] | undefined): FileRoute[] {
  const routes: FileRoute[] = [];
  const add = (file: string, method: string, path: string, framework: string) =>
    routes.push({ file, method, path: path.replace(/\/+$/, '') || '/', line: 1, framework, snippet: file });

  for (const file of paths) {
    // ── Next.js
    const n = under(file, roots.next);
    if (n !== null) {
      const rel = n.replace(/^src\//, '');
      let m: RegExpMatchArray | null;
      if ((m = rel.match(/^pages\/(api\/.*)\.(js|jsx|ts|tsx)$/))) {
        add(file, 'ANY', segmentsToPath(m[1].split('/')), 'Next.js API');
      } else if ((m = rel.match(/^pages\/(.*)\.(jsx|tsx|js|ts|mdx)$/)) && !/(^|\/)_(app|document|error)$/.test(m[1])) {
        add(file, 'PAGE', segmentsToPath(m[1].split('/')), 'Next.js pages');
      } else if ((m = rel.match(/^app\/(?:(.*)\/)?route\.(js|ts)$/))) {
        const ex = exportsOf(file);
        const methods = ex ? HTTP.filter((h) => ex.includes(h)) : [];
        for (const method of methods.length ? methods : ['ANY']) add(file, method, segmentsToPath((m[1] ?? '').split('/')), 'Next.js route handler');
      } else if ((m = rel.match(/^app\/(?:(.*)\/)?page\.(jsx|tsx|js|ts|mdx)$/))) {
        add(file, 'PAGE', segmentsToPath((m[1] ?? '').split('/')), 'Next.js app router');
      }
      continue;
    }
    // ── SvelteKit
    const s = under(file, roots.sveltekit);
    if (s !== null) {
      let m: RegExpMatchArray | null;
      if ((m = s.match(/^src\/routes\/(?:(.*)\/)?\+server\.(js|ts)$/))) {
        const ex = exportsOf(file);
        const methods = ex ? HTTP.filter((h) => ex.includes(h)) : [];
        for (const method of methods.length ? methods : ['ANY']) add(file, method, segmentsToPath((m[1] ?? '').split('/')), 'SvelteKit endpoint');
      } else if ((m = s.match(/^src\/routes\/(?:(.*)\/)?\+page\.svelte$/))) {
        add(file, 'PAGE', segmentsToPath((m[1] ?? '').split('/')), 'SvelteKit page');
      }
      continue;
    }
    // ── Nuxt
    const x = under(file, roots.nuxt);
    if (x !== null) {
      let m: RegExpMatchArray | null;
      if ((m = x.match(/^server\/(api|routes)\/(.*?)(?:\.(get|post|put|patch|delete))?\.(js|ts)$/))) {
        add(file, m[3]?.toUpperCase() ?? 'ANY', (m[1] === 'api' ? '/api' : '') + segmentsToPath(m[2].split('/')), 'Nuxt server');
      } else if ((m = x.match(/^pages\/(.*)\.vue$/))) {
        add(file, 'PAGE', segmentsToPath(m[1].split('/')), 'Nuxt page');
      }
      continue;
    }
    // ── Remix / React Router v7 flat routes
    const r = under(file, roots.remix);
    if (r !== null) {
      const m = r.match(/^app\/routes\/([^/]+?)(?:\/route)?\.(tsx|jsx|ts|js)$/);
      if (m) {
        const segs = m[1].split('.').map((p) => p.replace(/^_/, '').replace(/_$/, ''));
        const path = segmentsToPath(segs.filter(Boolean));
        const ex = exportsOf(file) ?? [];
        if (ex.includes('default') || !exportsOf(file)) add(file, 'PAGE', path, 'Remix route');
        if (ex.includes('loader') && !ex.includes('default')) add(file, 'GET', path, 'Remix loader');
        if (ex.includes('action')) add(file, 'POST', path, 'Remix action');
      }
    }
  }
  return routes;
}
