import { handleGithub } from './github-proxy';
import { handle } from './handler';

/** Cloudflare Worker entry: deploy with `npx wrangler deploy` from /edge. */
interface Env {
  ALLOWED_ORIGINS?: string;
  /** read-only token for the /api/gh proxy: `npx wrangler secret put GITHUB_TOKEN` */
  GITHUB_TOKEN?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith('/api/gh/')) return handleGithub(request, { token: env.GITHUB_TOKEN, allowedOrigins: env.ALLOWED_ORIGINS });
    if (pathname === '/api/fetch' || pathname === '/') return handle(request, { allowedOrigins: env.ALLOWED_ORIGINS });
    return new Response('Not found', { status: 404 });
  },
};
