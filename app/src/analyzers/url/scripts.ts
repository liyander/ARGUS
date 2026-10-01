/**
 * First-party bundle inspection: API base URLs, route strings, GraphQL operations,
 * and library version banners. Passive — it reads the JS every visitor downloads.
 */

export interface ScriptFindings {
  apiOrigins: Map<string, { count: number; sample: string; script: string }>;
  routes: Map<string, { script: string; sample: string }>;
  graphqlOps: { type: string; name: string; script: string }[];
  libraries: Map<string, { version: string; script: string; banner: string }>;
}

const BANNERS: [RegExp, string][] = [
  [/React(?:DOM)? v(1[5-9]\.\d+\.\d+)/, 'react'],
  [/version:"(1[6-9]\.\d+\.\d+(?:-[\w.]+)?)",rendererPackageName:"react-dom"/, 'react-dom'],
  [/Vue\.js v(\d+\.\d+\.\d+)/, 'vue'],
  [/jQuery v(\d+\.\d+\.\d+)/, 'jquery'],
  [/lodash(?:\.com)?\s*(?:<https:\/\/lodash\.com\/>)?[^\n]{0,40}?(?:v|Lodash )(\d+\.\d+\.\d+)/i, 'lodash'],
  [/Bootstrap v(\d+\.\d+\.\d+)/, 'bootstrap'],
  [/moment(?:\.js)? ?v?ersion ?:? ?"?(\d+\.\d+\.\d+)/i, 'moment'],
  [/axios v?(\d+\.\d+\.\d+)/i, 'axios'],
  [/core-js@(\d+\.\d+\.\d+)|version:"(3\.\d+\.\d+)",mode:"global"/, 'core-js'],
  [/three\.js r(\d+)/i, 'three'],
  [/Chart\.js v(\d+\.\d+\.\d+)/, 'chart.js'],
  [/@sentry\/browser\s*(\d+\.\d+\.\d+)|SDK_VERSION="(\d+\.\d+\.\d+)"/, '@sentry/browser'],
  [/swiper (\d+\.\d+\.\d+)/i, 'swiper'],
  [/DOMPurify (\d+\.\d+\.\d+)/, 'dompurify'],
  [/Next\.js v?(1[0-9]\.\d+\.\d+)|"next\/dist\/[^"]+"[^]{0,60}?(1[0-9]\.\d+\.\d+)/, 'next'],
];

const SKIP_ORIGINS = /(w3\.org|reactjs\.org|react\.dev|github\.com\/[\w-]+\/[\w-]+\/(issues|blob)|mozilla\.org|schema\.org|example\.com|localhost|sentry\.io\/for|npm\.im|fb\.me|googleapis\.com\/css|tailwindcss\.com|vuejs\.org|nextjs\.org\/docs|svelte\.dev|mdn|stackoverflow|wikipedia)/;

export function inspectScripts(scripts: { url: string; content: string }[], pageHost: string): ScriptFindings {
  const out: ScriptFindings = { apiOrigins: new Map(), routes: new Map(), graphqlOps: [], libraries: new Map() };
  for (const s of scripts) {
    const src = s.content;
    if (!src) continue;
    // API-ish absolute URLs
    for (const m of src.matchAll(/["'`](https:\/\/([a-z0-9-]+\.)+[a-z]{2,})(\/[\w\-./{}:$]*)?["'`]/gi)) {
      const origin = m[1].toLowerCase();
      const host = origin.replace('https://', '');
      if (SKIP_ORIGINS.test(m[0])) continue;
      const path = m[3] ?? '';
      const apiLike = /(^|\.)(api|gql|graphql|backend|gateway|rpc|edge|functions?)\b/.test(host) || /^\/(api|v\d|graphql|rest|rpc)\b/.test(path) || /supabase\.co|firebaseio|execute-api/.test(host);
      if (!apiLike || host === pageHost) continue;
      const prev = out.apiOrigins.get(origin);
      if (prev) prev.count++;
      else out.apiOrigins.set(origin, { count: 1, sample: m[1] + path, script: s.url });
    }
    // relative API routes
    for (const m of src.matchAll(/["'`](\/(?:api|v1|v2|v3|graphql|rest|rpc|trpc|auth)(?:\/[\w\-.:{}$]+)*\/?)["'`?]/g)) {
      const route = m[1].replace(/\$\{[^}]*\}/g, ':param');
      if (route.length > 120 || out.routes.size > 300) continue;
      if (!out.routes.has(route)) out.routes.set(route, { script: s.url, sample: src.slice(Math.max(0, (m.index ?? 0) - 40), (m.index ?? 0) + m[0].length + 40) });
    }
    // GraphQL operations
    for (const m of src.matchAll(/\b(query|mutation|subscription)\s+([A-Z]\w{2,})\s*[({]/g)) {
      if (out.graphqlOps.length < 200 && !out.graphqlOps.some((o) => o.name === m[2])) out.graphqlOps.push({ type: m[1], name: m[2], script: s.url });
    }
    // version banners
    for (const [re, pkg] of BANNERS) {
      if (out.libraries.has(pkg)) continue;
      const m = src.match(re);
      const version = m?.slice(1).find(Boolean);
      if (m && version) out.libraries.set(pkg, { version, script: s.url, banner: m[0].slice(0, 120) });
    }
  }
  return out;
}
