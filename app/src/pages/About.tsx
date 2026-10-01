import { useEffect } from 'react';
import { Icon } from '../components/Icon';
import { badgeMarkdown } from '../lib/export';
import { PROJECT_REPO_URL, SITE_URL } from '../lib/config';

const REPO_STEPS = [
  ['Parse input', 'owner/repo, full GitHub URLs, and /tree/<branch>/<folder> links for folder-scoped analysis.'],
  ['Metadata', 'GET /repos/{owner}/{repo} — stars, default branch, license. API call #1.'],
  ['File tree', 'GET /git/trees/{branch}?recursive=1 — every path and size. API call #2. The treemap renders from this alone.'],
  ['Classify', 'Manifests, infra, data, tests, docs and source. node_modules, build output, big lockfiles and binaries are skipped.'],
  ['Download', 'Manifests and infra first, then source by likely importance, from raw.githubusercontent.com (no API quota). Budget: 1,500 files / 30 MB.'],
  ['Detect stack', 'Manifests (npm, PyPI, Go, Maven/Gradle, Cargo, RubyGems, Composer, Pub) + signature rules for frameworks, datastores and SDKs.'],
  ['Extract endpoints', 'Express/Fastify/Hono/Koa, NestJS, Next.js, SvelteKit, Nuxt, Remix, Flask, FastAPI, Django, Spring, JAX-RS, Go routers, Rails, Laravel, Symfony, GraphQL SDL.'],
  ['Module graph', 'Babel ASTs for JS/TS (in Web Workers); pattern extraction for Python, Go, Java/Kotlin, Ruby, PHP. Resolves relative paths, tsconfig paths and monorepo workspaces.'],
  ['Enrich & infer', 'OSV.dev for known vulnerabilities, deps.dev for latest versions, licenses and publish dates. Then architecture layers and a health score.'],
];

const URL_STEPS = [
  ['Edge fetch', 'A ~200-line Cloudflare Worker fetches the page, its same-site scripts, robots.txt, sitemap.xml, security.txt and the web manifest. 5 MB / 10 s caps, private IPs blocked on every redirect hop.'],
  ['Headers', 'Server, X-Powered-By, CDN and host markers; a security-header scorecard.'],
  ['Fingerprints', 'Hand-written rules over HTML, meta tags, script URLs and bundle contents.'],
  ['Bundles', 'API base URLs, /api route strings, GraphQL operations, library version banners and public source maps.'],
  ['Third parties & DNS', 'Every external domain classified; DNS over HTTPS for MX/TXT/NS/CNAME reveals email providers and verified SaaS.'],
  ['Infer', 'Rendering style, API layer and backend. Anything not directly observed is drawn dashed and labelled inferred.'],
];

export default function About({ section }: { section?: 'terms' }) {
  useEffect(() => {
    if (section) document.getElementById(section)?.scrollIntoView();
  }, [section]);
  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-12">
      <h1 className="text-4xl font-semibold tracking-tight">How Stackscope works</h1>
      <p className="mt-3 text-lg text-muted">
        Stackscope is a static React site. Repo mode runs entirely in your browser. URL mode needs one tiny edge function, because browsers can&apos;t read other sites&apos; responses (CORS). All the analysis logic still runs on your machine.
      </p>

      <h2 className="mt-12 flex items-center gap-2 text-xl font-semibold"><Icon name="github" className="text-accent" /> Repo mode, nine steps</h2>
      <ol className="mt-4 space-y-3">
        {REPO_STEPS.map(([t, d], i) => (
          <li key={t} className="glass flex gap-4 rounded-xl p-4">
            <span className="mono flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-xs text-accent">{i + 1}</span>
            <div><div className="font-medium">{t}</div><div className="mt-0.5 text-sm text-muted">{d}</div></div>
          </li>
        ))}
      </ol>

      <h2 className="mt-12 flex items-center gap-2 text-xl font-semibold"><Icon name="globe" className="text-accent" /> URL mode (passive only)</h2>
      <ol className="mt-4 space-y-3">
        {URL_STEPS.map(([t, d], i) => (
          <li key={t} className="glass flex gap-4 rounded-xl p-4">
            <span className="mono flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-xs text-accent">{i + 1}</span>
            <div><div className="font-medium">{t}</div><div className="mt-0.5 text-sm text-muted">{d}</div></div>
          </li>
        ))}
      </ol>

      <h2 className="mt-12 text-xl font-semibold">Honest limits</h2>
      <ul className="mt-4 list-disc space-y-2 pl-5 text-muted">
        <li><b className="text-text">Static detection.</b> Routes built from variables, config files or plugins at runtime may be missed. Every endpoint links to the line it came from so you can check.</li>
        <li><b className="text-text">Parsing depth.</b> JS/TS is parsed into real ASTs; other languages use careful pattern matching, which can miss unusual styles.</li>
        <li><b className="text-text">Vulnerabilities</b> are matched against the minimum version a manifest range allows. Your lockfile may already resolve to a patched version.</li>
        <li><b className="text-text">Big repos</b> are analyzed partially (the most important 1,500 source files). The UI always says what was skipped. Analyze a subfolder URL for full detail.</li>
        <li><b className="text-text">URL mode</b> never sees backend code, databases or private endpoints. Single-page apps that fetch everything after load show less. Inferred nodes are dashed and labelled.</li>
        <li><b className="text-text">Private repos</b> are out of scope for v1.</li>
      </ul>

      <h2 className="mt-12 text-xl font-semibold">Privacy & safety</h2>
      <ul className="mt-4 list-disc space-y-2 pl-5 text-muted">
        <li>Your GitHub token (optional) stays in this tab&apos;s sessionStorage and is sent only to api.github.com.</li>
        <li>Without your own token, GitHub metadata and file trees go through a read-only, cached Stackscope proxy (public repos only), then fall back to the ungh.cc and jsDelivr public mirrors. The scan log shows which source answered.</li>
        <li>Analyses are cached in your browser&apos;s IndexedDB. Nothing is stored server-side.</li>
        <li>The edge function blocks private and internal IP ranges, rate-limits visitors, caps size and time, and caches responses for an hour.</li>
        <li>URL mode doesn&apos;t brute-force paths, probe for vulnerabilities, or attempt logins.</li>
      </ul>

      <h2 className="mt-12 text-xl font-semibold">Add a badge to your README</h2>
      <pre className="mono glass mt-3 overflow-x-auto rounded-xl p-4 text-xs text-muted">{badgeMarkdown(SITE_URL, 'owner/repo')}</pre>

      <h2 id="terms" className="mt-12 scroll-mt-20 text-xl font-semibold">Terms</h2>
      <div className="mt-3 space-y-2 text-sm text-muted">
        <p>Stackscope is for analyzing public information and your own projects. Don&apos;t use it to target systems you don&apos;t have permission to assess.</p>
        <p>Results are automated, best-effort, and come with no warranty. Detections can be wrong. Check the evidence before relying on a finding.</p>
        <p>Third-party data comes from GitHub, OSV.dev, deps.dev and Cloudflare DNS, under their own terms.</p>
      </div>
      <p className="mt-10 text-sm text-faint">Source & issues: <a className="text-accent hover:underline" href={PROJECT_REPO_URL}>{PROJECT_REPO_URL.replace('https://', '')}</a></p>
    </div>
  );
}
