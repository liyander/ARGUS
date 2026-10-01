import { useEffect, useState } from 'react';
import { getContent } from '../core/content';
import { extname } from '../lib/util';
import { Skeleton } from './ui';

const LANG: Record<string, string> = {
  '.ts': 'typescript', '.mts': 'typescript', '.cts': 'typescript', '.tsx': 'tsx', '.js': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript', '.jsx': 'jsx',
  '.py': 'python', '.go': 'go', '.java': 'java', '.kt': 'kotlin', '.rb': 'ruby', '.php': 'php', '.vue': 'vue', '.svelte': 'svelte', '.astro': 'astro',
  '.graphql': 'graphql', '.gql': 'graphql', '.json': 'json', '.yml': 'yaml', '.yaml': 'yaml', '.toml': 'toml', '.prisma': 'prisma', '.sql': 'sql',
  '.rs': 'rust', '.cs': 'csharp', '.md': 'markdown', '.css': 'css', '.scss': 'scss', '.html': 'html', '.sh': 'bash', '.tf': 'hcl', '.xml': 'xml',
};

function langFor(path: string) {
  const name = path.split('/').pop() ?? '';
  if (name === 'Dockerfile' || name.startsWith('Dockerfile.')) return 'dockerfile';
  if (name === 'Gemfile' || name === 'Rakefile') return 'ruby';
  if (name === 'go.mod') return 'go';
  return LANG[extname(path)] ?? 'text';
}

const RADIUS = 18;

/** Syntax-highlighted excerpt around `line` (Shiki, lazy-loaded). */
export function CodeView({ owner, repo, sha, path, line }: { owner: string; repo: string; sha: string; path: string; line?: number }) {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setHtml(null);
    setError(null);
    (async () => {
      const text = await getContent(owner, repo, sha, path);
      if (cancelled) return;
      if (text === null) {
        setError('Could not load this file.');
        return;
      }
      const lines = text.split('\n');
      const target = line && line > 0 ? line : 1;
      const start = Math.max(1, target - (line ? RADIUS : 0));
      const end = Math.min(lines.length, start + RADIUS * 2 + (line ? 0 : 20));
      const excerpt = lines.slice(start - 1, end).join('\n');
      const { codeToHtml } = await import('shiki');
      let lang = langFor(path);
      let out: string;
      try {
        out = await render(codeToHtml, excerpt, lang, start, line);
      } catch {
        lang = 'text';
        out = await render(codeToHtml, excerpt, lang, start, line);
      }
      if (!cancelled) setHtml(out);
    })().catch((e) => !cancelled && setError(String(e?.message ?? e)));
    return () => {
      cancelled = true;
    };
  }, [owner, repo, sha, path, line]);

  if (error) return <div className="px-3 py-4 text-xs text-danger">{error}</div>;
  if (!html) {
    return (
      <div className="space-y-2 p-3">
        {Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-3" />)}
      </div>
    );
  }
  return <div className="code-view max-h-[420px] overflow-auto" dangerouslySetInnerHTML={{ __html: html }} />;
}

type CodeToHtml = typeof import('shiki').codeToHtml;

function render(codeToHtml: CodeToHtml, code: string, lang: string, start: number, highlight?: number) {
  return codeToHtml(code, {
    lang,
    themes: { light: 'github-light', dark: 'github-dark-dimmed' },
    transformers: [
      {
        line(node, i) {
          const n = start + i - 1;
          node.properties['data-line'] = String(n);
          if (highlight && n === highlight) this.addClassToHast(node, 'hl');
        },
      },
    ],
  });
}
