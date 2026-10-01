import { handle } from '../edge/src/handler';
import { runUrlPipeline } from '../app/src/analyzers/url/index';
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: any, init?: any) => {
  const u = typeof input === 'string' ? input : input.url;
  if (u.startsWith('/api/fetch')) return handle(new Request('http://local' + u), { devMode: true });
  return realFetch(input, init);
}) as typeof fetch;
const a = await runUrlPipeline(process.argv[2] ?? 'vercel.com', { log: (l, t) => console.log(`[${l}] ${t}`), update: () => {} });
console.log('stack', a.summary.stack.join(', '));
console.log('counts', JSON.stringify(a.summary.counts));
console.log('nodes', a.nodes.map((n) => `${n.kind}:${n.label}${n.confidence !== 'confirmed' ? '?' : ''}`).slice(0, 60).join(' | '));
