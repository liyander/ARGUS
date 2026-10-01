/**
 * Pre-computes showcase analyses with the exact pipeline the browser runs.
 *
 *   cd app && GITHUB_TOKEN=… npm run showcase            # all repos in showcase-repos.json
 *   cd app && npm run showcase -- vercel/next.js          # just some
 *
 * Writes app/public/showcase/<slug>.json and index.json. Run nightly in CI so
 * gallery visitors get instant, rate-limit-free demos.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runRepoPipeline } from '../app/src/analyzers/repo/index';
import { parseBatch } from '../app/src/analyzers/repo/parse-file';
import { clearContents } from '../app/src/core/content';
import type { Analysis } from '../app/src/core/model';
import type { ShowcaseEntry } from '../app/src/core/showcase';
import { slugFor } from '../app/src/core/showcase';
import { setGithubToken } from '../app/src/sources/github';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, '../app/public/showcase');
mkdirSync(OUT, { recursive: true });

setGithubToken(process.env.GITHUB_TOKEN ?? null);
if (!process.env.GITHUB_TOKEN) console.warn('⚠ No GITHUB_TOKEN: limited to ~30 repos/hour (2 API calls each).');

const list: string[] = JSON.parse(readFileSync(join(here, 'showcase-repos.json'), 'utf8'));
const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const targets = args.length ? args : list;
const indexPath = join(OUT, 'index.json');
const index: ShowcaseEntry[] = existsSync(indexPath) ? JSON.parse(readFileSync(indexPath, 'utf8')) : [];

/** Keep files small: cap the tree and trim long evidence snippets. */
function slim(a: Analysis): Analysis {
  return {
    ...a,
    nodes: a.nodes.map((n) => ({ ...n, evidence: n.evidence.slice(0, 8).map((e) => ({ ...e, snippet: e.snippet?.slice(0, 160) })) })),
    context: { ...a.context, tree: a.context.tree?.slice(0, 25000) },
  };
}

let ok = 0;
for (const target of targets) {
  const t0 = Date.now();
  process.stdout.write(`→ ${target} … `);
  try {
    clearContents();
    const analysis = await runRepoPipeline(target, { backend: { parseBatch: async (files) => parseBatch(files) }, concurrency: 12 }, {
      log: () => {},
      update: () => {},
    });
    if (!analysis.summary.counts.filesAnalyzed && analysis.summary.counts.sourceFiles) {
      throw new Error('no files could be downloaded (throttled?), not saving an empty analysis');
    }
    // pause between repos so raw.githubusercontent.com doesn't throttle us
    await new Promise((r) => setTimeout(r, 4000));
    const slug = slugFor(target);
    writeFileSync(join(OUT, `${slug}.json`), JSON.stringify(slim(analysis)));
    const entry: ShowcaseEntry = {
      target,
      slug,
      title: analysis.context.repo?.fullName ?? target,
      description: analysis.context.repo?.description ?? null,
      stars: analysis.context.repo?.stars ?? 0,
      score: analysis.summary.health.score,
      grade: analysis.summary.health.grade,
      stack: analysis.summary.stack.slice(0, 8),
      counts: analysis.summary.counts,
      language: analysis.context.repo?.language ?? null,
      analyzedAt: analysis.createdAt,
    };
    const i = index.findIndex((e) => e.slug === slug);
    if (i >= 0) index[i] = entry;
    else index.push(entry);
    ok++;
    console.log(`✓ ${analysis.summary.counts.filesAnalyzed} files, ${analysis.summary.counts.endpoints} endpoints, health ${entry.score} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  } catch (err) {
    console.log(`✗ ${(err as Error).message}`);
    if ((err as { rateLimited?: boolean }).rateLimited) break;
  }
  index.sort((a, b) => b.stars - a.stars);
  writeFileSync(indexPath, JSON.stringify(index, null, 1));
}
console.log(`\nDone: ${ok}/${targets.length} analyzed → ${OUT}`);
