import type { Layer, NodeKind } from '../../../core/model';

/**
 * Hand-written fingerprint rules (not derived from Wappalyzer data).
 * A rule matches if ANY of its patterns hit. `version` regexes capture group 1.
 */
export interface Fingerprint {
  name: string;
  category: string;
  kind: Extract<NodeKind, 'framework' | 'service' | 'infra'>;
  layer: Layer;
  logo?: string;
  /** raw HTML */
  html?: RegExp[];
  /** <script src> URLs */
  scriptSrc?: RegExp[];
  /** <meta name|property=… content=…> */
  meta?: [string, RegExp][];
  /** first-party JS bundle contents */
  js?: RegExp[];
  version?: RegExp[];
  /** known open-source app → offer "Open in repo mode" */
  repo?: string;
  /** a detection of this rule implies these too */
  implies?: string[];
}

const F = (r: Fingerprint) => r;

export const FINGERPRINTS: Fingerprint[] = [
  // ── Meta-frameworks
  F({ name: 'Next.js', category: 'Meta-framework', kind: 'framework', layer: 'frontend', logo: 'nextdotjs',
    html: [/<script[^>]+id="__NEXT_DATA__"/, /self\.__next_f\.push/, /\/_next\/static\//], implies: ['React'],
    version: [/window\.next\s*=\s*\{\s*version:\s*"([^"]+)"/, /\{version:"(1[0-9]\.\d+\.\d+(?:-[\w.]+)?)",appDir/] }),
  F({ name: 'Nuxt', category: 'Meta-framework', kind: 'framework', layer: 'frontend', logo: 'nuxt',
    html: [/window\.__NUXT__/, /\/_nuxt\//, /<div id="__nuxt"/, /data-nuxt-/], implies: ['Vue'] }),
  F({ name: 'SvelteKit', category: 'Meta-framework', kind: 'framework', layer: 'frontend', logo: 'svelte',
    html: [/__sveltekit_/, /\/_app\/immutable\//, /data-sveltekit-/], implies: ['Svelte'] }),
  F({ name: 'Remix / React Router', category: 'Meta-framework', kind: 'framework', layer: 'frontend', logo: 'remix',
    html: [/window\.__remixContext/, /window\.__reactRouterContext/], implies: ['React'] }),
  F({ name: 'Gatsby', category: 'Meta-framework', kind: 'framework', layer: 'frontend', logo: 'gatsby',
    html: [/<div id="___gatsby"/, /\/page-data\/app-data\.json/], meta: [['generator', /Gatsby\s*([\d.]+)?/]], implies: ['React'] }),
  F({ name: 'Astro', category: 'Meta-framework', kind: 'framework', layer: 'frontend', logo: 'astro',
    html: [/<astro-island/, /\/_astro\//], meta: [['generator', /Astro v?([\d.]+)?/]] }),
  F({ name: 'Docusaurus', category: 'Docs framework', kind: 'framework', layer: 'frontend', logo: 'docusaurus',
    meta: [['generator', /Docusaurus v?([\d.]+)?/]], html: [/__docusaurus/], implies: ['React'] }),
  F({ name: 'VitePress', category: 'Docs framework', kind: 'framework', layer: 'frontend', logo: 'vitepress',
    meta: [['generator', /VitePress v?([\d.]+)?/]], implies: ['Vue'] }),
  F({ name: 'Hugo', category: 'Static site generator', kind: 'framework', layer: 'frontend', logo: 'hugo', meta: [['generator', /Hugo ([\d.]+)/]] }),
  F({ name: 'Jekyll', category: 'Static site generator', kind: 'framework', layer: 'frontend', logo: 'jekyll', meta: [['generator', /Jekyll v?([\d.]+)/]] }),
  F({ name: 'Eleventy', category: 'Static site generator', kind: 'framework', layer: 'frontend', logo: 'eleventy', meta: [['generator', /Eleventy v?([\d.]+)/]] }),
  F({ name: 'Angular Universal / SSR', category: 'Meta-framework', kind: 'framework', layer: 'frontend', logo: 'angular', html: [/ng-server-context/] }),
  // ── UI libraries
  F({ name: 'React', category: 'UI library', kind: 'framework', layer: 'frontend', logo: 'react',
    html: [/data-reactroot/, /data-reactid/], js: [/react\.production\.min\.js/, /__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED/, /\.createElement\("div"/, /react-dom\.production/],
    version: [/React v?(1[5-9]\.\d+\.\d+)/, /reconcilerVersion:"(1[6-9]\.\d+\.\d+[^"]*)"/, /version:"(1[6-9]\.\d+\.\d+[^"]*)",rendererPackageName:"react-dom"/] }),
  F({ name: 'Vue', category: 'UI framework', kind: 'framework', layer: 'frontend', logo: 'vuedotjs',
    html: [/data-v-[0-9a-f]{8}/, /<div id="app"[^>]*data-v-app/], js: [/__VUE__/, /Vue\.js v[\d.]+/, /__vue_app__/], version: [/Vue\.js v([\d.]+)/, /version:"(3\.\d+\.\d+)"/] }),
  F({ name: 'Angular', category: 'UI framework', kind: 'framework', layer: 'frontend', logo: 'angular',
    html: [/ng-version="([\d.]+)"/, /<app-root/], version: [/ng-version="([\d.]+)"/] }),
  F({ name: 'Svelte', category: 'UI framework', kind: 'framework', layer: 'frontend', logo: 'svelte', html: [/class="[^"]*svelte-[a-z0-9]{6}/], js: [/svelte-[a-z0-9]{6}/] }),
  F({ name: 'Preact', category: 'UI library', kind: 'framework', layer: 'frontend', logo: 'preact', js: [/__PREACT_DEVTOOLS__/] }),
  F({ name: 'Solid', category: 'UI library', kind: 'framework', layer: 'frontend', logo: 'solid', html: [/data-hk="/], js: [/_\$HY/] }),
  F({ name: 'Alpine.js', category: 'UI library', kind: 'framework', layer: 'frontend', logo: 'alpinedotjs', html: [/\bx-data=/], scriptSrc: [/alpine(\.min)?\.js|alpinejs/] }),
  F({ name: 'htmx', category: 'UI library', kind: 'framework', layer: 'frontend', logo: 'htmx', html: [/\bhx-(get|post|swap|target)=/], scriptSrc: [/htmx(\.min)?\.js|htmx\.org/] }),
  F({ name: 'jQuery', category: 'JS library', kind: 'framework', layer: 'frontend', logo: 'jquery',
    scriptSrc: [/jquery[-.]?([\d.]+)?(\.min)?\.js/], js: [/jQuery v([\d.]+)/], version: [/jquery[-.]([\d.]+\d)(\.min)?\.js/, /jQuery v([\d.]+)/] }),
  F({ name: 'Bootstrap', category: 'CSS framework', kind: 'framework', layer: 'frontend', logo: 'bootstrap', html: [/bootstrap(\.min)?\.css/], scriptSrc: [/bootstrap(\.bundle)?(\.min)?\.js/] }),
  F({ name: 'Tailwind CSS', category: 'CSS framework', kind: 'framework', layer: 'frontend', logo: 'tailwindcss',
    html: [/class="[^"]*\b(?:flex|grid) [^"]*\b(?:px|py|mt|mb|gap)-\d[^"]*\b(?:text|bg)-(?:gray|slate|zinc|neutral)-\d{2,3}/], js: [/--tw-ring-color|--tw-translate-x/] }),
  F({ name: 'Three.js', category: 'Graphics', kind: 'framework', layer: 'frontend', logo: 'threedotjs', js: [/THREE\.WebGLRenderer|WebGLRenderer\(\{/] }),
  F({ name: 'Webpack', category: 'Bundler', kind: 'infra', layer: 'infra', logo: 'webpack', js: [/webpackChunk|__webpack_require__/] }),
  F({ name: 'Vite', category: 'Bundler', kind: 'infra', layer: 'infra', logo: 'vite', html: [/<script type="module" crossorigin src="\/assets\/index-[\w-]+\.js"/], js: [/__vite__mapDeps|import\.meta\.env\.VITE_/] }),
  F({ name: 'Turbopack', category: 'Bundler', kind: 'infra', layer: 'infra', logo: 'turbopack', js: [/TURBOPACK/] }),
  // ── CMS / platforms (repo bridge for open-source ones)
  F({ name: 'WordPress', category: 'CMS', kind: 'framework', layer: 'service', logo: 'wordpress', repo: 'WordPress/WordPress',
    html: [/\/wp-content\//, /\/wp-includes\//], meta: [['generator', /WordPress ?([\d.]+)?/]], version: [/ver=([\d.]+)/] }),
  F({ name: 'Ghost', category: 'CMS', kind: 'framework', layer: 'service', logo: 'ghost', repo: 'TryGhost/Ghost', meta: [['generator', /Ghost ?([\d.]+)?/]] }),
  F({ name: 'Discourse', category: 'Forum', kind: 'framework', layer: 'service', logo: 'discourse', repo: 'discourse/discourse', meta: [['generator', /Discourse ?([\d.]+)?/]], html: [/discourse-assets/] }),
  F({ name: 'Mastodon', category: 'Social network', kind: 'framework', layer: 'service', logo: 'mastodon', repo: 'mastodon/mastodon', html: [/id="mastodon"/, /mastodon-initial-state/] }),
  F({ name: 'Drupal', category: 'CMS', kind: 'framework', layer: 'service', logo: 'drupal', repo: 'drupal/drupal', meta: [['generator', /Drupal ?([\d.]+)?/]], html: [/\/sites\/default\/files\//] }),
  F({ name: 'Joomla', category: 'CMS', kind: 'framework', layer: 'service', logo: 'joomla', meta: [['generator', /Joomla/]] }),
  F({ name: 'Shopify', category: 'E-commerce platform', kind: 'service', layer: 'service', logo: 'shopify', html: [/cdn\.shopify\.com/, /Shopify\.theme/] }),
  F({ name: 'Webflow', category: 'Site builder', kind: 'service', layer: 'service', logo: 'webflow', html: [/data-wf-page=/], meta: [['generator', /Webflow/]] }),
  F({ name: 'Framer', category: 'Site builder', kind: 'service', layer: 'service', logo: 'framer', html: [/framerusercontent\.com/], meta: [['generator', /Framer/]] }),
  F({ name: 'Wix', category: 'Site builder', kind: 'service', layer: 'service', logo: 'wix', meta: [['generator', /Wix\.com/]] }),
  F({ name: 'Squarespace', category: 'Site builder', kind: 'service', layer: 'service', logo: 'squarespace', html: [/static1\.squarespace\.com/] }),
  F({ name: 'Mintlify', category: 'Docs platform', kind: 'service', layer: 'service', html: [/mintcdn\.com|mintlify-assets|_mintlify\//] }),
  F({ name: 'GitBook', category: 'Docs platform', kind: 'service', layer: 'service', logo: 'gitbook', meta: [['generator', /GitBook/]] }),
  F({ name: 'Laravel', category: 'Web framework', kind: 'framework', layer: 'service', logo: 'laravel', html: [/laravel_session/, /name="csrf-token"/] }),
  F({ name: 'Ruby on Rails', category: 'Web framework', kind: 'framework', layer: 'service', logo: 'rubyonrails', html: [/name="csrf-param" content="authenticity_token"/, /data-turbo-track/] }),
  F({ name: 'Django', category: 'Web framework', kind: 'framework', layer: 'service', logo: 'django', html: [/name="csrfmiddlewaretoken"/] }),
  F({ name: 'Phoenix LiveView', category: 'Web framework', kind: 'framework', layer: 'service', logo: 'phoenixframework', html: [/data-phx-main/, /phx-socket/] }),
  F({ name: 'ASP.NET', category: 'Web framework', kind: 'framework', layer: 'service', logo: 'dotnet', html: [/__VIEWSTATE/, /__RequestVerificationToken/] }),
  F({ name: 'Blazor', category: 'Web framework', kind: 'framework', layer: 'frontend', logo: 'blazor', scriptSrc: [/_framework\/blazor\./] }),
  // ── Backend services visible from the client
  F({ name: 'Firebase', category: 'Backend-as-a-service', kind: 'service', layer: 'external', logo: 'firebase', js: [/firebaseapp\.com|firebaseio\.com|initializeApp\(\{[^}]*apiKey/], scriptSrc: [/firebasejs|__\/firebase\//] }),
  F({ name: 'Supabase', category: 'Backend-as-a-service', kind: 'service', layer: 'external', logo: 'supabase', js: [/\.supabase\.co\b/], html: [/\.supabase\.co\b/] }),
  F({ name: 'Sentry', category: 'Error tracking', kind: 'service', layer: 'external', logo: 'sentry', js: [/ingest\.(us\.)?sentry\.io|o\d+\.ingest\.sentry\.io|__SENTRY__/], scriptSrc: [/browser\.sentry-cdn\.com/] }),
  F({ name: 'Stripe', category: 'Payments', kind: 'service', layer: 'external', logo: 'stripe', scriptSrc: [/js\.stripe\.com/], js: [/pk_(live|test)_[A-Za-z0-9]{10,}/] }),
  F({ name: 'Clerk', category: 'Auth', kind: 'service', layer: 'external', logo: 'clerk', js: [/clerk\.accounts\.dev|__clerk_/], scriptSrc: [/clerk\./] }),
  F({ name: 'Auth0', category: 'Auth', kind: 'service', layer: 'external', logo: 'auth0', js: [/\.auth0\.com/] }),
  F({ name: 'Algolia', category: 'Search', kind: 'service', layer: 'external', logo: 'algolia', js: [/algolia\.net|algolianet\.com/], html: [/algolia/i] }),
  F({ name: 'Apollo GraphQL', category: 'GraphQL client', kind: 'framework', layer: 'frontend', logo: 'apollographql', js: [/__APOLLO_CLIENT__|ApolloClient/], html: [/__APOLLO_STATE__/] }),
  F({ name: 'Intercom', category: 'Chat widget', kind: 'service', layer: 'external', logo: 'intercom', js: [/widget\.intercom\.io/], html: [/widget\.intercom\.io|intercomSettings/] }),
  F({ name: 'Cloudflare Turnstile', category: 'Bot protection', kind: 'service', layer: 'external', logo: 'cloudflare', scriptSrc: [/challenges\.cloudflare\.com\/turnstile/] }),
  F({ name: 'reCAPTCHA', category: 'Bot protection', kind: 'service', layer: 'external', logo: 'google', scriptSrc: [/recaptcha/] }),
];
