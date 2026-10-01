import { handle } from '../../../edge/src/handler';

/**
 * Cloudflare Pages Function: serves the same edge handler at /api/fetch when the
 * static site is deployed to Cloudflare Pages (no separate Worker needed).
 */
export const onRequest = (ctx: { request: Request; env: { ALLOWED_ORIGINS?: string } }) =>
  handle(ctx.request, { allowedOrigins: ctx.env.ALLOWED_ORIGINS });
