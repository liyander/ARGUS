import { lineAt, lineOf } from '../../../lib/util';
import type { InfraFinding } from './docker';

/** Deploy targets recognisable from the actions a workflow uses. */
const DEPLOY_ACTIONS: [RegExp, string, string][] = [
  [/amondnet\/vercel-action|vercel\s+deploy|vercel --prod/, 'Vercel', 'vercel'],
  [/aws-actions\/|aws\s+s3\s+sync|aws ecs|sam deploy|cdk deploy/, 'AWS', 'amazonwebservices'],
  [/google-github-actions\//, 'Google Cloud', 'googlecloud'],
  [/azure\/(webapps-deploy|login|k8s-deploy)/, 'Azure', 'microsoftazure'],
  [/superfly\/flyctl-actions|flyctl deploy/, 'Fly.io', 'flydotio'],
  [/cloudflare\/(wrangler-action|pages-action)/, 'Cloudflare', 'cloudflare'],
  [/peaceiris\/actions-gh-pages|actions\/deploy-pages/, 'GitHub Pages', 'github'],
  [/docker\/build-push-action/, 'Container registry', 'docker'],
  [/netlify\/actions|nwtgck\/actions-netlify|netlify deploy/, 'Netlify', 'netlify'],
  [/akhileshns\/heroku-deploy/, 'Heroku', 'heroku'],
  [/changesets\/action|npm publish|pnpm publish/, 'npm registry', 'npm'],
  [/pypa\/gh-action-pypi-publish|twine upload/, 'PyPI', 'pypi'],
];

/** Keys directly under a top-level YAML key (`on:` / `jobs:`), or its inline value list. */
function childKeys(content: string, key: string): string[] {
  const lines = content.split('\n');
  const start = lines.findIndex((l) => new RegExp(`^["']?${key}["']?:`).test(l));
  if (start === -1) return [];
  const inline = lines[start].split(':').slice(1).join(':').trim();
  if (inline) return inline.replace(/[[\]]/g, '').split(',').map((s) => s.trim()).filter(Boolean);
  const keys: string[] = [];
  for (const l of lines.slice(start + 1)) {
    if (/^\S/.test(l)) break;
    const m = l.match(/^ {2}([\w-]+):/);
    if (m) keys.push(m[1]);
  }
  return keys;
}

export function analyzeWorkflow(path: string, content: string): InfraFinding[] {
  const name = content.match(/^name:\s*["']?(.+?)["']?\s*$/m)?.[1] ?? path.split('/').pop()!;
  const triggers = childKeys(content, 'on');
  const jobs = childKeys(content, 'jobs');
  const uses = [...new Set([...content.matchAll(/uses:\s*["']?([\w.-]+\/[\w.-]+)/g)].map((m) => m[1]))];
  const out: InfraFinding[] = [{
    name: 'GitHub Actions', kind: 'infra', category: 'CI/CD', file: path, line: 1, snippet: `workflow: ${name}`, logo: 'githubactions',
    meta: { workflow: name, triggers: [...new Set(triggers)], jobs, actions: uses },
  }];
  for (const [re, target, logo] of DEPLOY_ACTIONS) {
    const m = content.match(re);
    if (!m) continue;
    const line = lineOf(content, m.index ?? 0);
    out.push({ name: target, kind: 'infra', category: 'Deploy target', file: path, line, snippet: lineAt(content, line), logo, meta: { via: name } });
  }
  return out;
}
