# Stackscope

**X-ray any codebase or website. See the stack, the endpoints, and the architecture as one living map.**

Stackscope turns a GitHub repo or a live URL into an interactive, explorable map of how the software works. Other tools detect stacks. Stackscope also shows how the pieces relate: every component is a node you can click, every connection is visible, and every claim links to the file line, header or DNS record it came from.

| Mode | Input | What it knows | Confidence |
|---|---|---|---|
| Repo | `owner/repo`, GitHub URLs, `/tree/<branch>/<folder>` | Real code: stack, dependencies, routes, modules, infra | High (read from source) |
| URL | `https://example.com` | Public surface: headers, frameworks, bundles, third parties, DNS | Medium (detected) / low (inferred) |

## Quick start

```bash
cd app
npm install
npm run dev          # http://localhost:5173, URL mode works too (dev middleware runs the edge handler)
```

### GitHub rate limits

Anonymous GitHub API access is capped at 60 requests per hour per IP. Stackscope uses only **2 API calls per repo** and routes them through a fallback chain, so scans keep working when that cap is hit:

1. **Your own token** (key icon in the UI), if set: sent straight to api.github.com from your browser.
2. **The Stackscope GitHub proxy** (`/api/gh`): a read-only edge function authenticated with the *deployer's* token (5,000/hour, shared), with responses cached at the edge (trees by commit SHA for 24 h, metadata for 10 min). It serves only `/repos/{owner}/{repo}` and its git trees, only for public repos, with a per-visitor rate limit. The token never reaches browsers. In `npm run dev` it uses `$GITHUB_TOKEN` or your local `gh auth login` automatically.
3. **api.github.com anonymously.**
4. **No-API fallback:** metadata from [ungh.cc](https://ungh.cc), the file list from jsDelivr (repos up to 50 MB). If the mirror is busy too, the scan still runs from jsDelivr alone, without stars or license.

File contents come from `raw.githubusercontent.com` (no API quota). If that host throttles, downloads switch to the jsDelivr CDN for the rest of the session. The scan log always says which source answered.

Stackscope doesn't rotate IPs or pool tokens to evade GitHub's limits. It relies on caching, one legitimately configured server token, and public mirrors.

## What's inside

```
app/                    Vite + React 18 + TypeScript static site
  src/core/             model.ts (the unified Analysis type), pipeline, cache (IndexedDB), health score
  src/sources/          github.ts (2 API calls + raw downloads), edge.ts (URL-fetch client)
  src/analyzers/repo/   classify → stack/ (manifests) → routes/ → imports/ → infra/ → enrich (OSV + deps.dev)
  src/analyzers/url/    headers, fingerprints/rules.ts, scripts (bundle inspection), thirdparty, dns
  src/workers/          parse.worker.ts (Babel ASTs) + a 2–4 worker pool via Comlink
  src/graph/            ELK architecture layout, React Flow nodes, canvas galaxy engine, flows.ts + dots-scene.ts (Dots)
  src/views/            Overview, Architecture, Galaxy, Endpoints, Dependencies, Treemap, Third parties, Dots
  src/pages/            Landing, Results workspace, Compare, Gallery, About/Terms
  functions/api/        Cloudflare Pages Functions → /api/fetch and /api/gh/* (same edge handlers)
  public/showcase/      pre-computed analyses (generated)
edge/                   handler.ts (URL fetch) + github-proxy.ts (/api/gh); standalone Worker if you host the site elsewhere
scripts/                build-showcase.ts, smoke.ts (run the pipeline in Node)
.github/workflows/      CI, deploy to Cloudflare Pages, nightly showcase refresh
```

### The data model

Both modes emit one `Analysis` object (`app/src/core/model.ts`): `nodes` (file, module, endpoint, dependency, framework, service, datastore, thirdParty, infra), `edges` (imports, calls, handles, dependsOn, servesFrom, readsWrites), a summary with a health score, and warnings. Every node has a `confidence` (`confirmed` / `likely` / `inferred`) and `evidence[]`. Every view renders from this object, so both modes get every view that applies to them.

### Repo pipeline

1. Parse input (`owner/repo`, full URLs, branch/folder URLs)
2. Metadata, API call 1
3. Recursive tree, API call 2 (the treemap renders from this alone)
4. Classify files (manifests, infra, data, tests, docs, source; skips vendored/build/binary files)
5. Download manifests and infra first, then source by importance. Budget: 1,500 files / 30 MB, with a visible partial-analysis notice
6. Detect the stack from npm, PyPI (requirements/pyproject/Pipfile/setup), Go, Maven/Gradle, Cargo, RubyGems, Composer and Pub manifests, plus a technology catalog
7. Extract endpoints: Express/Fastify/Hono/Koa (with router mount prefixes), NestJS, Next.js (pages + app router), SvelteKit, Nuxt, Remix, Flask, FastAPI (router prefixes), Django (+ `include()` and DRF routers), Spring, JAX-RS, Go (net/http incl. 1.22 patterns, Gin, Echo, chi, Fiber, gorilla/mux), Rails, Laravel, Symfony, GraphQL SDL
8. Build the module graph: Babel ASTs for JS/TS in Web Workers, pattern extraction for Python/Go/Java/Kotlin/Ruby/PHP. Resolves relative paths, tsconfig `paths`/`baseUrl`, monorepo workspace packages, Go module paths and Python packages. Frontend `fetch`/`axios` calls are linked to the endpoints they hit
9. Enrich and infer: OSV.dev vulnerabilities, deps.dev latest version/license/publish date, architecture layers, health score

### URL pipeline (passive only)

The edge function (`edge/src/handler.ts`, ~250 lines) fetches the page, its same-site scripts, `robots.txt`, `sitemap.xml`, `/.well-known/security.txt` and the web manifest. Everything else happens in the browser: header analysis, a security-header scorecard, fingerprinting, bundle inspection (API origins, `/api` strings, GraphQL operations, version banners, public source maps), the third-party map, DNS over HTTPS, rendering-style inference, and a "repo bridge" to open linked GitHub repos in repo mode.

Edge safeguards: http(s) and default ports only, no credentials in URLs, private, internal and reserved IP ranges blocked after DNS resolution and on every redirect hop, 5 MB / 10 s caps, 20 analyses per 10 minutes per visitor, and a 1-hour response cache.

## Dots: watch a request travel through the system

The **Dots** view (`8`) turns the analysis into animated, explorable request traces in 3D (Three.js, lazy-loaded):

- **Repo mode:** one flow per detected endpoint. A trace starts at the frontend component that calls the endpoint (if one was linked), passes the host/edge, hits the handler, then walks the real import tree depth-first. Each service is called from the file that imports it and does its own data work: ORM → database (`SELECT` / `INSERT` / `UPDATE` by HTTP method), cache lookup → miss → DB → `SET`, queue enqueue → ack, external API calls. Then the response returns along the same path.
- **URL mode:** page load (DNS → CDN/host → origin; short-circuited when the edge reports a cache `HIT`), API calls found in bundles, and analytics/ad beacons.
- Every station is a procedural 3D model (browser, edge globe, router, service chip, ORM, database, cache cube, queue conveyor, satellite for external APIs). Every hop carries a confidence label and its evidence. Dashed hops are inferred, for example a write that must hit the repo's only database when no driver import was found on that path.
- Controls: play/pause (`space`), step (`←`/`→`), speed, **traffic** mode (many concurrent requests), orbit/zoom, and clicking a station or step to open the detail panel. Shareable via `?view=dots&flow=…`.

Check traces without the UI: `cd app && npx tsx ../scripts/flows-check.ts <showcase-slug> [count]`.

## Deploy

**Cloudflare Pages (recommended):** one project serves the static site and `/api/fetch`.

```bash
cd app && npm run build && npx wrangler pages deploy dist --project-name=stackscope
```

The `deploy.yml` workflow does this on every push to `main`. It needs the `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets.

Then give the GitHub proxy its token: create a **fine-grained token with public-repository read-only access** (no other permissions) and add it to the Pages project as the secret `GITHUB_TOKEN`:

```bash
npx wrangler pages secret put GITHUB_TOKEN --project-name=stackscope
```

Without it `/api/gh` returns 501 and clients fall through to the anonymous and mirror routes.

**Other static hosts (Vercel, Netlify, S3…):** deploy `app/dist` with an SPA fallback to `index.html`. Deploy the Worker separately (`cd edge && npx wrangler secret put GITHUB_TOKEN && npx wrangler deploy`) and build the app with `VITE_EDGE_URL=https://stackscope-edge.<you>.workers.dev/api/fetch`. Set `ALLOWED_ORIGINS` in `edge/wrangler.toml` to your site's origin.

Other build-time settings: `VITE_SITE_URL` (used in share links and badges) and `VITE_PROJECT_REPO_URL` (used for "report a missed route" links).

## Showcase

```bash
cd app && GITHUB_TOKEN=$(gh auth token) npm run showcase              # everything in scripts/showcase-repos.json
cd app && npm run showcase -- vercel/next.js honojs/hono              # just some
```

This writes `app/public/showcase/*.json`. The gallery, landing-page galaxy and compare mode load these instantly, with no rate limits. `showcase.yml` refreshes them nightly.

## Extending

- **New framework or service:** add a line to `app/src/analyzers/repo/catalog.ts`.
- **New route pattern:** add an extractor in `app/src/analyzers/repo/routes/` and call it from the language's parser in `imports/`.
- **New ecosystem:** add a `ManifestParser` in `app/src/analyzers/repo/stack/` and register it in `stack/index.ts`.
- **New URL fingerprint:** add a rule to `app/src/analyzers/url/fingerprints/rules.ts`.

Check a change against real repos without the UI:

```bash
cd app && npx tsx ../scripts/smoke.ts owner/repo
```

## Honest limits

- Route detection is static. Routes built from variables or runtime config can be missed, so every endpoint links to its source line.
- Only JS/TS is parsed into real ASTs. Other languages use careful pattern matching. tree-sitter grammars are the planned upgrade.
- Vulnerabilities are matched against the minimum version a manifest range allows. Lockfiles aren't parsed yet.
- URL mode never sees backend code or private endpoints, and SPAs that fetch after load show less. Rendered-page analysis with a headless browser is a later upgrade.
- Private repos are out of scope for v1.

## Keyboard

`⌘/Ctrl K` command palette · `1`–`8` switch views · `F` focus mode · `L` scan log · `T` theme · `Esc` clear selection · `/` focus the input on the landing page
#   A R G U S  
 