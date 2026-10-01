import { basename, lineAt, lineOf } from '../../../lib/util';

export interface InfraFinding {
  name: string;
  kind: 'infra' | 'datastore';
  category: string;
  file: string;
  line: number;
  snippet: string;
  logo?: string;
  meta?: Record<string, unknown>;
}

/** Container images that reveal a backing datastore or broker. */
const IMAGE_DATASTORES: [RegExp, string, string, string][] = [
  [/^(postgres|postgis\/postgis|bitnami\/postgresql|supabase\/postgres|timescale\/timescaledb)/, 'PostgreSQL', 'SQL database', 'postgresql'],
  [/^(mysql|mariadb|bitnami\/mysql)/, 'MySQL', 'SQL database', 'mysql'],
  [/^(mongo|bitnami\/mongodb)/, 'MongoDB', 'Document database', 'mongodb'],
  [/^(redis|bitnami\/redis|valkey\/valkey|eqalpha\/keydb)/, 'Redis', 'Cache / KV', 'redis'],
  [/^(rabbitmq)/, 'RabbitMQ', 'Message broker', 'rabbitmq'],
  [/^(confluentinc\/cp-kafka|bitnami\/kafka|apache\/kafka|redpandadata)/, 'Kafka', 'Event stream', 'apachekafka'],
  [/^(elasticsearch|docker\.elastic\.co\/elasticsearch|opensearchproject)/, 'Elasticsearch', 'Search engine', 'elasticsearch'],
  [/^(minio\/minio)/, 'MinIO', 'Object storage', 'minio'],
  [/^(clickhouse)/, 'ClickHouse', 'Analytics database', 'clickhouse'],
  [/^(memcached)/, 'Memcached', 'Cache', ''],
  [/^(qdrant|chromadb|weaviate|milvusdb)/, 'Vector database', 'Vector database', ''],
];

export function analyzeDockerfile(path: string, content: string): InfraFinding[] {
  const out: InfraFinding[] = [];
  const froms = [...content.matchAll(/^FROM\s+(?:--platform=\S+\s+)?(\S+)/gim)].map((m) => m[1]);
  const ports = [...content.matchAll(/^EXPOSE\s+(.+)$/gim)].flatMap((m) => m[1].split(/\s+/));
  const i = content.search(/^FROM/im);
  const line = i >= 0 ? lineOf(content, i) : 1;
  out.push({
    name: 'Docker', kind: 'infra', category: 'Container', file: path, line, snippet: lineAt(content, line), logo: 'docker',
    meta: { baseImages: froms, exposedPorts: ports, multiStage: froms.length > 1 },
  });
  return out;
}

export function analyzeCompose(path: string, content: string): InfraFinding[] {
  const out: InfraFinding[] = [];
  const services: string[] = [];
  for (const m of content.matchAll(/^\s{2}([\w.-]+):\s*$/gm)) services.push(m[1]);
  const line = lineOf(content, Math.max(0, content.search(/^services:/m)));
  out.push({
    name: 'Docker Compose', kind: 'infra', category: 'Orchestration', file: path, line, snippet: lineAt(content, line), logo: 'docker',
    meta: { services },
  });
  for (const m of content.matchAll(/^\s+image:\s*["']?([^\s"']+)/gm)) {
    const image = m[1];
    const hit = IMAGE_DATASTORES.find(([re]) => re.test(image));
    if (!hit) continue;
    const l = lineOf(content, m.index ?? 0);
    out.push({ name: hit[1], kind: 'datastore', category: hit[2], file: path, line: l, snippet: lineAt(content, l), logo: hit[3] || undefined, meta: { image } });
  }
  return out;
}

const HOST_FILES: Record<string, [string, string, string]> = {
  'vercel.json': ['Vercel', 'Hosting', 'vercel'],
  'netlify.toml': ['Netlify', 'Hosting', 'netlify'],
  'fly.toml': ['Fly.io', 'Hosting', 'flydotio'],
  'render.yaml': ['Render', 'Hosting', 'render'],
  'railway.json': ['Railway', 'Hosting', 'railway'],
  'Procfile': ['Heroku-style Procfile', 'Hosting', 'heroku'],
  'app.yaml': ['Google App Engine', 'Hosting', 'googlecloud'],
  'wrangler.toml': ['Cloudflare Workers', 'Edge runtime', 'cloudflare'],
  'wrangler.json': ['Cloudflare Workers', 'Edge runtime', 'cloudflare'],
  'firebase.json': ['Firebase Hosting', 'Hosting', 'firebase'],
  'amplify.yml': ['AWS Amplify', 'Hosting', 'awsamplify'],
  'serverless.yml': ['Serverless Framework', 'Functions', 'serverless'],
  'serverless.yaml': ['Serverless Framework', 'Functions', 'serverless'],
  'Chart.yaml': ['Helm', 'Kubernetes packaging', 'helm'],
  'skaffold.yaml': ['Skaffold', 'Kubernetes dev', 'kubernetes'],
  'Jenkinsfile': ['Jenkins', 'CI/CD', 'jenkins'],
  'nixpacks.toml': ['Nixpacks', 'Build', ''],
  'cloudbuild.yaml': ['Google Cloud Build', 'CI/CD', 'googlecloud'],
};

export function analyzeHostConfig(path: string, content: string): InfraFinding[] {
  const name = basename(path);
  const host = HOST_FILES[name];
  if (host) return [{ name: host[0], kind: 'infra', category: host[1], file: path, line: 1, snippet: lineAt(content, 1), logo: host[2] || undefined }];
  if (name.endsWith('.tf')) {
    const providers = [...new Set([...content.matchAll(/(?:provider|resource|data)\s+"(\w+?)(?:_\w+)?"/g)].map((m) => m[1]))];
    return [{ name: 'Terraform', kind: 'infra', category: 'Infrastructure as code', file: path, line: 1, snippet: lineAt(content, 1), logo: 'terraform', meta: { providers } }];
  }
  if (/(^|\/)(k8s|kubernetes|deploy|manifests|helm)\//.test(path) && /^kind:\s*(Deployment|Service|Ingress|StatefulSet)/m.test(content)) {
    const kinds = [...new Set([...content.matchAll(/^kind:\s*(\w+)/gm)].map((m) => m[1]))];
    return [{ name: 'Kubernetes', kind: 'infra', category: 'Orchestration', file: path, line: 1, snippet: lineAt(content, 1), logo: 'kubernetes', meta: { kinds } }];
  }
  if (path === '.gitlab-ci.yml') return [{ name: 'GitLab CI', kind: 'infra', category: 'CI/CD', file: path, line: 1, snippet: lineAt(content, 1), logo: 'gitlab' }];
  if (path.startsWith('.circleci/')) return [{ name: 'CircleCI', kind: 'infra', category: 'CI/CD', file: path, line: 1, snippet: lineAt(content, 1), logo: 'circleci' }];
  return [];
}
