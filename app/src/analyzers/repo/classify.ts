import type { Layer, TreeEntry } from '../../core/model';
import { basename, extname, languageOf } from '../../lib/util';

export type FileRole =
  | 'manifest'
  | 'lockfile'
  | 'infra'
  | 'data'
  | 'test'
  | 'docs'
  | 'source'
  | 'config'
  | 'asset'
  | 'skip';

export interface ClassifiedFile extends TreeEntry {
  role: FileRole;
  language: string;
  /** higher = fetched earlier */
  priority: number;
}

const MANIFESTS = new Set([
  'package.json', 'requirements.txt', 'pyproject.toml', 'Pipfile', 'setup.py', 'setup.cfg', 'go.mod',
  'pom.xml', 'build.gradle', 'build.gradle.kts', 'Cargo.toml', 'Gemfile', 'composer.json', 'pubspec.yaml',
  'mix.exs', 'deno.json', 'deno.jsonc',
]);

const LOCKFILES = new Set([
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb', 'bun.lock', 'poetry.lock', 'Pipfile.lock',
  'Cargo.lock', 'Gemfile.lock', 'composer.lock', 'go.sum', 'uv.lock', 'pubspec.lock', 'mix.lock',
]);

const SKIP_DIRS =
  /(^|\/)(node_modules|bower_components|vendor|dist|build|out|\.next|\.nuxt|\.svelte-kit|\.output|coverage|target|__pycache__|\.venv|venv|\.tox|\.git|\.yarn|\.pnpm-store|\.turbo|\.cache|third_party|external)\//;

const NON_SHIPPING_DIRS =
  /(^|\/)(examples?|fixtures?|samples?|__tests__|tests?|e2e|benchmarks?|bench|demos?|playgrounds?|test-?apps?|sandbox(es)?|templates?|starters?)\//i;

const BINARY_EXT = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.ico', '.bmp', '.tiff', '.psd', '.svg',
  '.woff', '.woff2', '.ttf', '.otf', '.eot', '.mp3', '.mp4', '.webm', '.mov', '.wav', '.ogg', '.flac',
  '.zip', '.gz', '.tgz', '.rar', '.7z', '.jar', '.war', '.pdf', '.exe', '.dll', '.so', '.dylib', '.wasm',
  '.bin', '.dat', '.db', '.sqlite', '.pyc', '.class', '.o', '.a', '.lib', '.node', '.map', '.pb', '.onnx',
]);

const SOURCE_EXT = new Set([
  '.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs', '.vue', '.svelte', '.astro',
  '.py', '.go', '.java', '.kt', '.rb', '.php', '.rs', '.cs', '.scala', '.ex', '.exs', '.dart', '.swift',
  '.graphql', '.gql', '.c', '.h', '.cc', '.cpp', '.cxx', '.hpp', '.hh',
]);

/** Languages whose imports/routes we parse; others are counted but not downloaded. */
export const PARSEABLE_EXT = new Set([
  '.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs', '.vue', '.svelte', '.astro',
  '.py', '.go', '.java', '.kt', '.rb', '.php', '.graphql', '.gql',
  '.rs', '.c', '.h', '.cc', '.cpp', '.cxx', '.hpp', '.hh',
]);

function isTest(path: string): boolean {
  return (
    /(^|\/)(__tests__|__mocks__|tests?|spec|e2e|cypress|playwright|testdata|fixtures?)\//i.test(path) ||
    /\.(test|spec|e2e|stories)\.[a-z]+$/i.test(path) ||
    /(^|\/)test_[^/]+\.py$/.test(path) ||
    /_test\.(go|py)$/.test(path) ||
    /Tests?\.(java|kt|cs)$/.test(path)
  );
}

function isInfra(path: string, name: string): boolean {
  return (
    name === 'Dockerfile' || name.startsWith('Dockerfile.') || name.endsWith('.dockerfile') ||
    /^(docker-)?compose(\.[\w-]+)?\.ya?ml$/.test(name) ||
    path.startsWith('.github/workflows/') || path === '.gitlab-ci.yml' || path.startsWith('.circleci/') ||
    ['vercel.json', 'netlify.toml', 'fly.toml', 'render.yaml', 'app.yaml', 'Procfile', 'wrangler.toml',
      'wrangler.json', 'serverless.yml', 'serverless.yaml', 'railway.json', 'amplify.yml', 'firebase.json',
      'Chart.yaml', 'skaffold.yaml', 'Tiltfile', 'Jenkinsfile', 'nixpacks.toml', 'cloudbuild.yaml'].includes(name) ||
    /\.tf$/.test(name) ||
    /(^|\/)(k8s|kubernetes|helm|charts|deploy|deployment|infra|terraform)\/.*\.(ya?ml|tf|json)$/.test(path)
  );
}

function isData(path: string, name: string): boolean {
  return (
    name === 'schema.prisma' || extname(name) === '.prisma' || extname(name) === '.sql' ||
    /(^|\/)(migrations?|alembic|db\/migrate|seeds?)\//.test(path) ||
    /(^|\/)(models?|entities|schemas?)\/[^/]+\.(py|ts|js|rb|go|java|kt|php)$/.test(path) ||
    /(^|\/)(drizzle|knexfile|ormconfig)\b/.test(path) ||
    name === 'models.py'
  );
}

export function classifyFile(entry: TreeEntry): ClassifiedFile {
  const { path, size } = entry;
  const name = basename(path);
  const ext = extname(path);
  const language = languageOf(path);
  const base: ClassifiedFile = { ...entry, role: 'skip', language, priority: 0 };

  if (SKIP_DIRS.test(path) || /\.min\.(js|css)$/.test(name) || /\.bundle\.js$/.test(name)) return base;
  if (BINARY_EXT.has(ext)) return { ...base, role: 'asset' };
  if (LOCKFILES.has(name)) return { ...base, role: size > 2_000_000 ? 'skip' : 'lockfile' };
  if (MANIFESTS.has(name)) {
    // examples, fixtures and benchmarks pin old versions on purpose; they don't ship
    if (NON_SHIPPING_DIRS.test(path)) return { ...base, role: 'skip' };
    const depth = path.split('/').length;
    return { ...base, role: 'manifest', priority: 1000 - depth * 10 };
  }
  if (isInfra(path, name)) return { ...base, role: 'infra', priority: 900 };
  if (/(^|\/)(t|j)sconfig(\.[\w-]+)?\.json$/.test(path) || name === 'angular.json' || name === 'nx.json' ||
      name === 'turbo.json' || name === 'pnpm-workspace.yaml' || name === 'lerna.json' ||
      /^(next|nuxt|vite|svelte|astro|remix|webpack|rollup|tailwind)\.config\.[cm]?[jt]s$/.test(name)) {
    return { ...base, role: 'config', priority: 880 };
  }
  if (isTest(path)) return { ...base, role: 'test', priority: 10 };
  if (isData(path, name)) return { ...base, role: 'data', priority: 700 };
  if (/\.(md|mdx|rst|txt|adoc)$/i.test(name) || /(^|\/)docs?\//.test(path)) return { ...base, role: 'docs' };
  if (SOURCE_EXT.has(ext)) {
    if (size > 400_000) return { ...base, role: 'skip' }; // generated / vendored blobs
    return { ...base, role: 'source', priority: sourcePriority(path, name) };
  }
  if (['.css', '.scss', '.sass', '.less', '.html', '.json', '.yml', '.yaml', '.toml'].includes(ext)) {
    return { ...base, role: 'config' };
  }
  return { ...base, role: 'asset' };
}

function sourcePriority(path: string, name: string): number {
  let p = 300;
  const depth = path.split('/').length;
  p -= depth * 8;
  if (/^(index|main|app|server|cli|mod|__init__|manage|wsgi|asgi)\.[a-z]+$/.test(name)) p += 120;
  if (/(^|\/)(api|routes?|router|controllers?|handlers?|endpoints?|urls\.py|views\.py|resolvers?)(\/|$|\.)/.test(path)) p += 150;
  if (/(^|\/)(route|page|layout)\.[jt]sx?$/.test(path)) p += 140;
  if (/(^|\/)(src|app|lib|server|pkg|cmd|internal)\//.test(path)) p += 60;
  if (/(^|\/)(examples?|samples?|demo|benchmarks?|scripts|tools)\//.test(path)) p -= 160;
  if (/\.d\.ts$/.test(name)) p -= 200;
  return p;
}

const FRONTEND_RE =
  /(^|\/)(components?|pages|views|ui|client|frontend|web|www|hooks|styles|layouts?|screens|widgets|public|assets|stores?|composables)\//i;
const API_RE =
  /(^|\/)(api|routes?|routers?|controllers?|handlers?|endpoints?|resolvers?|graphql|rest|rpc|trpc)(\/|\.[a-z]+$)/i;
const DATA_RE =
  /(^|\/)(models?|entities|schemas?|prisma|migrations?|db|database|repositor(y|ies)|dao|orm|drizzle|sql)(\/|\.[a-z]+$)/i;
const SERVICE_RE =
  /(^|\/)(services?|lib|libs|utils?|helpers?|core|domain|usecases?|workers?|jobs?|queues?|middlewares?|internal|pkg)\//i;
const INFRA_RE = /(^|\/)(\.github|deploy|infra|k8s|terraform|docker|scripts|config)\//i;

export function inferLayerFromPath(path: string, role: FileRole): Layer {
  if (role === 'infra' || role === 'manifest' || role === 'config') return 'infra';
  if (role === 'data') return 'data';
  const name = basename(path);
  if (/(^|\/)pages\/api\//.test(path) || /(^|\/)route\.[jt]s$/.test(name) || /\+server\.[jt]s$/.test(name)) return 'api';
  if (/(urls|views|routes|controllers?)\.py$/.test(name)) return 'api';
  if (/\.(vue|svelte|astro|css|scss|less|html)$/.test(name)) return 'frontend';
  if (/(^|\/)(page|layout|loading|error|template)\.[jt]sx?$/.test(name)) return 'frontend';
  if (API_RE.test(path)) return 'api';
  if (DATA_RE.test(path)) return 'data';
  if (FRONTEND_RE.test(path)) return 'frontend';
  if (INFRA_RE.test(path)) return 'infra';
  if (SERVICE_RE.test(path)) return 'service';
  if (/\.(tsx|jsx)$/.test(name)) return 'frontend';
  return 'service';
}

/** Group files into modules by folder: two levels deep, three inside monorepo package dirs. */
export function moduleOf(path: string): string {
  const parts = path.split('/');
  parts.pop();
  if (parts.length === 0) return '(root)';
  const mono = ['packages', 'apps', 'libs', 'services', 'crates', 'modules', 'plugins', 'cmd', 'internal'];
  let depth = mono.includes(parts[0]) ? 3 : 2;
  if (parts[depth - 1] === 'src' && parts.length > depth) depth++; // packages/x/src/feature
  return parts.slice(0, depth).join('/');
}
