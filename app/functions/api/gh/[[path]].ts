import { handleGithub } from '../../../../edge/src/github-proxy';

/**
 * Cloudflare Pages Function: read-only GitHub proxy at /api/gh/*.
 * Set the GITHUB_TOKEN secret in the Pages project (a fine-grained token with
 * public-repository read access only).
 */
export const onRequest = (ctx: { request: Request; env: { GITHUB_TOKEN?: string; ALLOWED_ORIGINS?: string } }) =>
  handleGithub(ctx.request, { token: ctx.env.GITHUB_TOKEN, allowedOrigins: ctx.env.ALLOWED_ORIGINS });
