import type { Layer, NodeKind } from '../../core/model';

export interface HeaderFinding {
  name: string;
  category: string;
  kind: Extract<NodeKind, 'infra' | 'framework' | 'service'>;
  layer: Layer;
  header: string;
  value: string;
  logo?: string;
  version?: string;
}

/** [header, value pattern, name, category, kind, layer, logo] */
type Rule = [string, RegExp, string, string, HeaderFinding['kind'], Layer, string?];

const RULES: Rule[] = [
  // CDN / edge / host
  ['cf-ray', /./, 'Cloudflare', 'CDN', 'infra', 'infra', 'cloudflare'],
  ['server', /^cloudflare$/i, 'Cloudflare', 'CDN', 'infra', 'infra', 'cloudflare'],
  ['x-vercel-id', /./, 'Vercel', 'Hosting', 'infra', 'infra', 'vercel'],
  ['server', /^vercel$/i, 'Vercel', 'Hosting', 'infra', 'infra', 'vercel'],
  ['x-nf-request-id', /./, 'Netlify', 'Hosting', 'infra', 'infra', 'netlify'],
  ['server', /^netlify$/i, 'Netlify', 'Hosting', 'infra', 'infra', 'netlify'],
  ['x-amz-cf-id', /./, 'Amazon CloudFront', 'CDN', 'infra', 'infra', 'amazonwebservices'],
  ['server', /^AmazonS3$/i, 'Amazon S3', 'Static hosting', 'infra', 'infra', 'amazons3'],
  ['x-amz-apigw-id', /./, 'AWS API Gateway', 'API gateway', 'infra', 'infra', 'amazonapigateway'],
  ['server', /^awselb/i, 'AWS Elastic Load Balancing', 'Load balancer', 'infra', 'infra', 'amazonwebservices'],
  ['x-served-by', /cache-/i, 'Fastly', 'CDN', 'infra', 'infra', 'fastly'],
  ['x-fastly-request-id', /./, 'Fastly', 'CDN', 'infra', 'infra', 'fastly'],
  ['x-akamai-transformed', /./, 'Akamai', 'CDN', 'infra', 'infra', 'akamai'],
  ['server', /^AkamaiGHost/i, 'Akamai', 'CDN', 'infra', 'infra', 'akamai'],
  ['x-azure-ref', /./, 'Azure Front Door', 'CDN', 'infra', 'infra', 'microsoftazure'],
  ['x-github-request-id', /./, 'GitHub infrastructure', 'Hosting', 'infra', 'infra', 'github'],
  ['fly-request-id', /./, 'Fly.io', 'Hosting', 'infra', 'infra', 'flydotio'],
  ['server', /^Fly\//i, 'Fly.io', 'Hosting', 'infra', 'infra', 'flydotio'],
  ['x-render-origin-server', /./, 'Render', 'Hosting', 'infra', 'infra', 'render'],
  ['server', /^railway/i, 'Railway', 'Hosting', 'infra', 'infra', 'railway'],
  ['via', /vegur/i, 'Heroku', 'Hosting', 'infra', 'infra', 'heroku'],
  ['server', /^Google Frontend$|^gws$|^ESF$/i, 'Google Cloud', 'Hosting', 'infra', 'infra', 'googlecloud'],
  ['via', /1\.1 google/i, 'Google Cloud Load Balancer', 'Load balancer', 'infra', 'infra', 'googlecloud'],
  ['x-firebase-hosting', /./, 'Firebase Hosting', 'Hosting', 'infra', 'infra', 'firebase'],
  ['x-shopify-stage', /./, 'Shopify', 'E-commerce platform', 'service', 'service', 'shopify'],
  ['x-wix-request-id', /./, 'Wix', 'Site builder', 'service', 'service', 'wix'],
  ['server', /^Squarespace/i, 'Squarespace', 'Site builder', 'service', 'service', 'squarespace'],
  ['x-powered-by', /WP Engine/i, 'WP Engine', 'Hosting', 'infra', 'infra', 'wpengine'],
  ['x-hs-cache-config', /./, 'HubSpot CMS', 'CMS', 'service', 'service', 'hubspot'],
  ['x-deno-ray', /./, 'Deno Deploy', 'Hosting', 'infra', 'infra', 'deno'],
  ['x-nextjs-cache', /./, 'Next.js', 'Meta-framework', 'framework', 'frontend', 'nextdotjs'],
  ['x-nextjs-prerender', /./, 'Next.js', 'Meta-framework', 'framework', 'frontend', 'nextdotjs'],
  // Web servers
  ['server', /^nginx/i, 'nginx', 'Web server', 'infra', 'infra', 'nginx'],
  ['server', /^openresty/i, 'OpenResty', 'Web server', 'infra', 'infra', 'nginx'],
  ['server', /^Apache/i, 'Apache HTTP Server', 'Web server', 'infra', 'infra', 'apache'],
  ['server', /^Microsoft-IIS/i, 'IIS', 'Web server', 'infra', 'infra', 'microsoft'],
  ['server', /^LiteSpeed/i, 'LiteSpeed', 'Web server', 'infra', 'infra', 'litespeed'],
  ['server', /^Caddy/i, 'Caddy', 'Web server', 'infra', 'infra', 'caddy'],
  ['server', /^envoy/i, 'Envoy', 'Proxy', 'infra', 'infra', 'envoyproxy'],
  ['server', /^Kestrel/i, 'ASP.NET Core (Kestrel)', 'App server', 'framework', 'service', 'dotnet'],
  ['server', /^gunicorn/i, 'Gunicorn', 'App server', 'framework', 'service', 'gunicorn'],
  ['server', /^uvicorn/i, 'Uvicorn', 'App server', 'framework', 'service'],
  ['server', /^Werkzeug/i, 'Flask (Werkzeug)', 'Web framework', 'framework', 'service', 'flask'],
  ['server', /^Jetty/i, 'Jetty', 'App server', 'framework', 'service'],
  ['server', /^Cowboy/i, 'Cowboy (Erlang/Elixir)', 'App server', 'framework', 'service'],
  // Backend frameworks via X-Powered-By
  ['x-powered-by', /^Express$/i, 'Express', 'HTTP server', 'framework', 'service', 'express'],
  ['x-powered-by', /^Next\.js/i, 'Next.js', 'Meta-framework', 'framework', 'frontend', 'nextdotjs'],
  ['x-powered-by', /^Nuxt/i, 'Nuxt', 'Meta-framework', 'framework', 'frontend', 'nuxt'],
  ['x-powered-by', /^PHP/i, 'PHP', 'Language runtime', 'framework', 'service', 'php'],
  ['x-powered-by', /^ASP\.NET/i, 'ASP.NET', 'Web framework', 'framework', 'service', 'dotnet'],
  ['x-aspnet-version', /./, 'ASP.NET', 'Web framework', 'framework', 'service', 'dotnet'],
  ['x-powered-by', /Phusion Passenger/i, 'Phusion Passenger', 'App server', 'framework', 'service'],
  ['x-runtime', /^\d+\.\d+$/, 'Ruby on Rails (likely)', 'Web framework', 'framework', 'service', 'rubyonrails'],
  ['x-drupal-cache', /./, 'Drupal', 'CMS', 'framework', 'service', 'drupal'],
  ['x-generator', /Drupal/i, 'Drupal', 'CMS', 'framework', 'service', 'drupal'],
  ['x-pingback', /xmlrpc\.php/i, 'WordPress', 'CMS', 'framework', 'service', 'wordpress'],
  ['link', /wp-json/i, 'WordPress', 'CMS', 'framework', 'service', 'wordpress'],
  ['x-ghost-cache-status', /./, 'Ghost', 'CMS', 'framework', 'service', 'ghost'],
];

export function analyzeHeaders(headers: Record<string, string>): HeaderFinding[] {
  const out: HeaderFinding[] = [];
  const seen = new Set<string>();
  for (const [header, re, name, category, kind, layer, logo] of RULES) {
    const value = headers[header];
    if (value === undefined || !re.test(value) || seen.has(name)) continue;
    seen.add(name);
    const version = value.match(/\/(\d+(?:\.\d+)*)/)?.[1];
    out.push({ name, category, kind, layer, header, value, logo, version });
  }
  return out;
}

export interface SecurityHeaderCheck {
  name: string;
  present: boolean;
  value?: string;
  advice: string;
}

const SECURITY_HEADERS: [string, string, (v: string) => boolean][] = [
  ['strict-transport-security', 'Forces HTTPS for future visits (HSTS). Use max-age ≥ 15552000.', (v) => /max-age=\d{6,}/.test(v)],
  ['content-security-policy', 'Restricts where scripts/styles may load from; the main XSS mitigation.', (v) => v.length > 10],
  ['x-frame-options', 'Prevents clickjacking via iframes (or use CSP frame-ancestors).', () => true],
  ['x-content-type-options', 'Should be "nosniff" to stop MIME-type sniffing.', (v) => /nosniff/i.test(v)],
  ['referrer-policy', 'Limits how much of the URL leaks to other sites.', () => true],
  ['permissions-policy', 'Disables powerful browser features the site does not use.', () => true],
  ['cross-origin-opener-policy', 'Isolates the browsing context from cross-origin windows.', () => true],
];

export function securityHeaders(headers: Record<string, string>): SecurityHeaderCheck[] {
  return SECURITY_HEADERS.map(([name, advice, ok]) => {
    let value = headers[name];
    let present = value !== undefined && ok(value);
    // CSP frame-ancestors satisfies X-Frame-Options
    if (name === 'x-frame-options' && !present && /frame-ancestors/.test(headers['content-security-policy'] ?? '')) {
      present = true;
      value = 'via CSP frame-ancestors';
    }
    return { name, present, value, advice };
  });
}
