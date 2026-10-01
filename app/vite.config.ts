import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { execSync } from 'node:child_process';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { fileURLToPath } from 'node:url';

const EDGE_HANDLER = fileURLToPath(new URL('../edge/src/handler.ts', import.meta.url));
const GH_PROXY = fileURLToPath(new URL('../edge/src/github-proxy.ts', import.meta.url));

/** Dev token for the /api/gh proxy: $GITHUB_TOKEN, else the local `gh` CLI login. Server-side only. */
function devGithubToken(): string | undefined {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  try {
    return execSync('gh auth token', { stdio: ['ignore', 'pipe', 'ignore'], timeout: 15000 }).toString().trim() || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Dev-only: serve the edge functions (/api/fetch and /api/gh/*) so URL mode and the
 * GitHub proxy work with plain `npm run dev`. Production runs the same handlers on
 * Cloudflare (Pages Functions or the standalone Worker).
 */
function edgeDevProxy(): Plugin {
  const token = devGithubToken();
  const toRequest = (req: IncomingMessage) =>
    new Request(new URL((req as IncomingMessage & { originalUrl?: string }).originalUrl ?? req.url ?? '/', 'http://localhost'), {
      method: req.method,
      headers: { 'cf-connecting-ip': req.socket.remoteAddress ?? 'dev' },
    });
  const send = async (res: ServerResponse, response: Response) => {
    res.statusCode = response.status;
    response.headers.forEach((v, k) => res.setHeader(k, v));
    res.end(Buffer.from(await response.arrayBuffer()));
  };
  return {
    name: 'stackscope-edge-dev',
    configureServer(server) {
      server.config.logger.info(
        token
          ? '  ➜  GitHub proxy: /api/gh using your local GitHub token (server-side only)'
          : '  ➜  GitHub proxy: no token found (set GITHUB_TOKEN or run `gh auth login`); falling back to anonymous + jsDelivr',
      );
      server.middlewares.use('/api/fetch', async (req, res) => {
        try {
          const mod = await server.ssrLoadModule(EDGE_HANDLER);
          await send(res, await mod.handle(toRequest(req), { devMode: true }));
        } catch (err) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: String(err) }));
        }
      });
      server.middlewares.use('/api/gh', async (req, res) => {
        try {
          const mod = await server.ssrLoadModule(GH_PROXY);
          await send(res, await mod.handleGithub(toRequest(req), { token, devMode: true }));
        } catch (err) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ error: String(err) }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), edgeDevProxy()],
  server: {
    fs: { allow: ['..'] },
    // the showcase builder rewrites these files continuously; don't reload the page for them
    watch: { ignored: ['**/public/showcase/**'] },
  },
  worker: { format: 'es' },
});
