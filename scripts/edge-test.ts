import { handle } from '../edge/src/handler';
const call = async (u: string) => {
  const r = await handle(new Request(`http://x/api/fetch?url=${encodeURIComponent(u)}`), { devMode: true });
  const j = await r.json();
  return `${r.status} ${j.error ?? `final=${j.finalUrl} status=${j.status} html=${j.html.length} scripts=${j.scripts.length}/${j.allScripts.length} maps=${j.scripts.filter((s: any) => s.sourceMapPublic).length} robots=${!!j.extras.robots} sitemap=${j.extras.sitemap?.count ?? 0} hdr=${Object.keys(j.headers).length}`}`;
};
for (const u of ['http://localhost:8080', 'http://127.0.0.1', 'http://169.254.169.254/latest/meta-data', 'http://10.0.0.1', 'file:///etc/passwd', 'http://[::1]/', 'https://localtest.me', 'https://vercel.com', 'github.com'])
  console.log(u.padEnd(42), await call(u));
