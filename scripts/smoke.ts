/** Dev helper: run the repo pipeline in Node and print a summary. `npx tsx ../scripts/smoke.ts owner/repo` */
import { runRepoPipeline } from '../app/src/analyzers/repo/index';
import { parseBatch } from '../app/src/analyzers/repo/parse-file';
import { setGithubToken } from '../app/src/sources/github';

setGithubToken(process.env.GITHUB_TOKEN ?? null);

const target = process.argv[2] ?? 'fastapi/full-stack-fastapi-template';
const quiet = process.argv.includes('--quiet');
const a = await runRepoPipeline(target, { backend: { parseBatch: async (f) => parseBatch(f) }, fileBudget: Number(process.env.BUDGET ?? 400) }, {
  log: (l, t) => !quiet && console.log(`[${l}] ${t}`),
  update: () => {},
});
console.log('stack', a.summary.stack.join(', '));
console.log('counts', JSON.stringify(a.summary.counts));
console.log('health', a.summary.health.score, a.summary.health.grade);
for (const f of a.summary.health.factors) console.log(`  ${f.label}: ${f.score} — ${f.detail}`);
const vulnerable = a.nodes.filter((n) => n.kind === 'dependency' && (n.meta.vulns as unknown[])?.length);
for (const n of vulnerable) console.log(`  vuln ${n.label}@${n.meta.spec}: ${(n.meta.vulns as { severity: string }[]).map((v) => v.severity).join(',')}`);
const eps = a.nodes.filter((n) => n.kind === 'endpoint');
console.log(eps.slice(0, 12).map((n) => `  ${n.label}  ${n.meta.file}`).join('\n'));
console.log('arch', a.nodes.filter((n) => ['service', 'datastore', 'infra'].includes(n.kind)).map((n) => `${n.kind}:${n.label}`).join(', '));
console.log('modules', a.nodes.filter((n) => n.kind === 'module').length, 'edges', a.edges.length, 'calls', a.edges.filter((e) => e.kind === 'calls').length);
console.log('warnings', a.warnings);
