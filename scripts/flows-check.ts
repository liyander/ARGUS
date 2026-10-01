/** Dev helper: print the Dots traces for a showcase analysis. `npx tsx ../scripts/flows-check.ts <slug> [n]` */
import { readFileSync } from 'node:fs';
import { buildScenarios } from '../app/src/graph/flows';
const a = JSON.parse(readFileSync(`public/showcase/${process.argv[2]}.json`, 'utf8'));
const s = buildScenarios(a);
console.log(`${s.length} scenarios`);
for (const sc of s.slice(0, Number(process.argv[3] ?? 2))) {
  console.log(`\n== ${sc.title}  [${sc.stations.map((x) => `${x.kind}:${x.label}`).join(' | ')}]`);
  sc.hops.forEach((h, i) => console.log(`  ${i + 1}. ${h.direction === 'request' ? '→' : '←'} ${sc.stations.find((x) => x.id === h.from)?.label} → ${sc.stations.find((x) => x.id === h.to)?.label}: ${h.label} (${h.confidence})`));
}
