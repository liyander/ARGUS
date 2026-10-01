import type { Layer, NodeKind } from '../../core/model';

/**
 * Technology catalog: maps package names (or import specifiers) to what they mean
 * architecturally. Adding a technology = adding one line.
 */
export interface CatalogEntry {
  /** exact package name, or a RegExp tested against the package name */
  match: string | RegExp;
  name: string;
  kind: Extract<NodeKind, 'framework' | 'service' | 'datastore' | 'infra'>;
  category: string;
  layer: Layer;
  /** simple-icons slug for the logo cloud */
  logo?: string;
}

const fw = (match: string | RegExp, name: string, category: string, layer: Layer, logo?: string): CatalogEntry => ({ match, name, kind: 'framework', category, layer, logo });
const svc = (match: string | RegExp, name: string, category: string, logo?: string): CatalogEntry => ({ match, name, kind: 'service', category, layer: 'external', logo });
const db = (match: string | RegExp, name: string, category: string, logo?: string): CatalogEntry => ({ match, name, kind: 'datastore', category, layer: 'data', logo });

export const CATALOG: CatalogEntry[] = [
  // ── Frontend frameworks & UI
  fw('next', 'Next.js', 'Meta-framework', 'frontend', 'nextdotjs'),
  fw('react', 'React', 'UI library', 'frontend', 'react'),
  fw('preact', 'Preact', 'UI library', 'frontend', 'preact'),
  fw('vue', 'Vue', 'UI framework', 'frontend', 'vuedotjs'),
  fw('nuxt', 'Nuxt', 'Meta-framework', 'frontend', 'nuxt'),
  fw('svelte', 'Svelte', 'UI framework', 'frontend', 'svelte'),
  fw('@sveltejs/kit', 'SvelteKit', 'Meta-framework', 'frontend', 'svelte'),
  fw('@angular/core', 'Angular', 'UI framework', 'frontend', 'angular'),
  fw('solid-js', 'Solid', 'UI library', 'frontend', 'solid'),
  fw('astro', 'Astro', 'Meta-framework', 'frontend', 'astro'),
  fw(/^@remix-run\/(react|node)$/, 'Remix', 'Meta-framework', 'frontend', 'remix'),
  fw('react-router', 'React Router', 'Routing', 'frontend', 'reactrouter'),
  fw('gatsby', 'Gatsby', 'Meta-framework', 'frontend', 'gatsby'),
  fw('@builder.io/qwik', 'Qwik', 'UI framework', 'frontend', 'qwik'),
  fw('react-native', 'React Native', 'Mobile', 'frontend', 'react'),
  fw('expo', 'Expo', 'Mobile', 'frontend', 'expo'),
  fw('electron', 'Electron', 'Desktop', 'frontend', 'electron'),
  fw('@tauri-apps/api', 'Tauri', 'Desktop', 'frontend', 'tauri'),
  fw('tailwindcss', 'Tailwind CSS', 'Styling', 'frontend', 'tailwindcss'),
  fw('styled-components', 'styled-components', 'Styling', 'frontend', 'styledcomponents'),
  fw(/^@mui\/material$/, 'Material UI', 'Component library', 'frontend', 'mui'),
  fw(/^@chakra-ui\/react$/, 'Chakra UI', 'Component library', 'frontend', 'chakraui'),
  fw(/^@radix-ui\//, 'Radix UI', 'Component library', 'frontend', 'radixui'),
  fw('redux', 'Redux', 'State', 'frontend', 'redux'),
  fw('@reduxjs/toolkit', 'Redux Toolkit', 'State', 'frontend', 'redux'),
  fw('zustand', 'Zustand', 'State', 'frontend'),
  fw('@tanstack/react-query', 'TanStack Query', 'Data fetching', 'frontend', 'reactquery'),
  fw('swr', 'SWR', 'Data fetching', 'frontend'),
  fw('three', 'Three.js', 'Graphics', 'frontend', 'threedotjs'),
  fw('d3', 'D3', 'Visualization', 'frontend', 'd3dotjs'),
  fw('vite', 'Vite', 'Build tool', 'infra', 'vite'),
  fw('webpack', 'webpack', 'Build tool', 'infra', 'webpack'),
  fw('turbo', 'Turborepo', 'Monorepo', 'infra', 'turborepo'),
  fw('nx', 'Nx', 'Monorepo', 'infra', 'nx'),
  fw('typescript', 'TypeScript', 'Language', 'infra', 'typescript'),
  // ── Backend frameworks
  fw('express', 'Express', 'HTTP server', 'api', 'express'),
  fw('fastify', 'Fastify', 'HTTP server', 'api', 'fastify'),
  fw('hono', 'Hono', 'HTTP server', 'api', 'hono'),
  fw('koa', 'Koa', 'HTTP server', 'api', 'koa'),
  fw('@nestjs/core', 'NestJS', 'HTTP server', 'api', 'nestjs'),
  fw('@hapi/hapi', 'hapi', 'HTTP server', 'api'),
  fw('elysia', 'Elysia', 'HTTP server', 'api'),
  fw(/^@trpc\/server$/, 'tRPC', 'API layer', 'api', 'trpc'),
  fw(/^(graphql|@apollo\/server|apollo-server(-express)?|graphql-yoga|mercurius|type-graphql)$/, 'GraphQL', 'API layer', 'api', 'graphql'),
  fw('socket.io', 'Socket.IO', 'Realtime', 'api', 'socketdotio'),
  fw('ws', 'WebSockets (ws)', 'Realtime', 'api'),
  fw('django', 'Django', 'Web framework', 'api', 'django'),
  fw('djangorestframework', 'Django REST Framework', 'API layer', 'api', 'django'),
  fw('flask', 'Flask', 'Web framework', 'api', 'flask'),
  fw('fastapi', 'FastAPI', 'Web framework', 'api', 'fastapi'),
  fw('starlette', 'Starlette', 'Web framework', 'api'),
  fw('aiohttp', 'aiohttp', 'Web framework', 'api', 'aiohttp'),
  fw('pydantic', 'Pydantic', 'Validation', 'service', 'pydantic'),
  fw('celery', 'Celery', 'Task queue', 'service', 'celery'),
  fw('streamlit', 'Streamlit', 'App framework', 'frontend', 'streamlit'),
  fw(/^(torch|pytorch)$/, 'PyTorch', 'ML', 'service', 'pytorch'),
  fw('tensorflow', 'TensorFlow', 'ML', 'service', 'tensorflow'),
  fw('langchain', 'LangChain', 'LLM framework', 'service', 'langchain'),
  fw('github.com/gin-gonic/gin', 'Gin', 'HTTP server', 'api', 'gin'),
  fw('github.com/labstack/echo/v4', 'Echo', 'HTTP server', 'api'),
  fw('github.com/gofiber/fiber/v2', 'Fiber', 'HTTP server', 'api'),
  fw(/^github\.com\/go-chi\/chi/, 'chi', 'HTTP router', 'api'),
  fw('github.com/gorilla/mux', 'gorilla/mux', 'HTTP router', 'api'),
  fw('google.golang.org/grpc', 'gRPC', 'RPC', 'api', 'grpc'),
  fw(/^org\.springframework\.boot:/, 'Spring Boot', 'Web framework', 'api', 'springboot'),
  fw(/^io\.quarkus:/, 'Quarkus', 'Web framework', 'api', 'quarkus'),
  fw('rails', 'Ruby on Rails', 'Web framework', 'api', 'rubyonrails'),
  fw('sinatra', 'Sinatra', 'Web framework', 'api'),
  fw('laravel/framework', 'Laravel', 'Web framework', 'api', 'laravel'),
  fw(/^symfony\/(framework-bundle|http-kernel)$/, 'Symfony', 'Web framework', 'api', 'symfony'),
  fw('actix-web', 'Actix Web', 'HTTP server', 'api'),
  fw('axum', 'Axum', 'HTTP server', 'api'),
  fw('rocket', 'Rocket', 'HTTP server', 'api'),
  fw('tokio', 'Tokio', 'Async runtime', 'service'),
  fw('phoenix', 'Phoenix', 'Web framework', 'api', 'phoenixframework'),
  fw('flutter', 'Flutter', 'Mobile', 'frontend', 'flutter'),
  // ── ORMs / data access (framework kind, data layer)
  fw(/^(@prisma\/client|prisma)$/, 'Prisma', 'ORM', 'data', 'prisma'),
  fw('drizzle-orm', 'Drizzle', 'ORM', 'data', 'drizzle'),
  fw('typeorm', 'TypeORM', 'ORM', 'data', 'typeorm'),
  fw('sequelize', 'Sequelize', 'ORM', 'data', 'sequelize'),
  fw('knex', 'Knex', 'Query builder', 'data'),
  fw('kysely', 'Kysely', 'Query builder', 'data'),
  fw('mongoose', 'Mongoose', 'ODM', 'data', 'mongoose'),
  fw(/^(sqlalchemy|flask-sqlalchemy)$/, 'SQLAlchemy', 'ORM', 'data', 'sqlalchemy'),
  fw('sqlmodel', 'SQLModel', 'ORM', 'data', 'sqlalchemy'),
  fw(/^(peewee|tortoise-orm|tortoise|pony)$/, 'Python ORM', 'ORM', 'data'),
  fw(/^(@mikro-orm\/core|objection|bookshelf|waterline)$/, 'Node ORM', 'ORM', 'data'),
  fw(/^(django\.db)$/, 'Django ORM', 'ORM', 'data', 'django'),
  fw('alembic', 'Alembic', 'Migrations', 'data'),
  fw('gorm.io/gorm', 'GORM', 'ORM', 'data'),
  fw(/^org\.hibernate/, 'Hibernate', 'ORM', 'data', 'hibernate'),
  fw('diesel', 'Diesel', 'ORM', 'data'),
  // ── Datastores
  db(/^(pg|postgres|@neondatabase\/serverless|@vercel\/postgres|psycopg2(-binary)?|psycopg|asyncpg|github\.com\/jackc\/pgx\/v5|github\.com\/lib\/pq|org\.postgresql:postgresql|sqlx)$/, 'PostgreSQL', 'SQL database', 'postgresql'),
  db(/^(mysql|mysql2|pymysql|mysqlclient|github\.com\/go-sql-driver\/mysql|mysql:mysql-connector-java|com\.mysql:mysql-connector-j)$/, 'MySQL', 'SQL database', 'mysql'),
  db(/^(sqlite3|better-sqlite3|@libsql\/client|github\.com\/mattn\/go-sqlite3|rusqlite)$/, 'SQLite', 'SQL database', 'sqlite'),
  db(/^(mongodb|pymongo|motor|go\.mongodb\.org\/mongo-driver)$/, 'MongoDB', 'Document database', 'mongodb'),
  db(/^(redis|ioredis|@upstash\/redis|github\.com\/redis\/go-redis\/v9|github\.com\/go-redis\/redis\/v8|redis-py)$/, 'Redis', 'Cache / KV', 'redis'),
  db(/^(bullmq|bull|bee-queue)$/, 'Redis queue', 'Job queue', 'redis'),
  db(/^(@elastic\/elasticsearch|elasticsearch)$/, 'Elasticsearch', 'Search engine', 'elasticsearch'),
  db(/^(kafkajs|confluent-kafka|kafka-python|github\.com\/segmentio\/kafka-go)$/, 'Kafka', 'Event stream', 'apachekafka'),
  db(/^(amqplib|pika|github\.com\/rabbitmq\/amqp091-go)$/, 'RabbitMQ', 'Message broker', 'rabbitmq'),
  db(/^(@pinecone-database\/pinecone|pinecone-client|pinecone)$/, 'Pinecone', 'Vector database'),
  db(/^(cassandra-driver)$/, 'Cassandra', 'Wide-column database', 'apachecassandra'),
  db(/^(@clickhouse\/client)$/, 'ClickHouse', 'Analytics database', 'clickhouse'),
  db(/^(@planetscale\/database)$/, 'PlanetScale', 'SQL database', 'planetscale'),
  db(/^(@aws-sdk\/client-dynamodb|@aws-sdk\/lib-dynamodb)$/, 'DynamoDB', 'Key-value database'),
  db(/^(@aws-sdk\/client-s3)$/, 'S3', 'Object storage'),
  // ── External services (SDKs)
  svc(/^(stripe|@stripe\/stripe-js|@stripe\/react-stripe-js|github\.com\/stripe\/stripe-go\/v\d+)$/, 'Stripe', 'Payments', 'stripe'),
  svc(/^(@paypal\/|paypal)/, 'PayPal', 'Payments', 'paypal'),
  svc(/^razorpay$/, 'Razorpay', 'Payments', 'razorpay'),
  svc(/^(@aws-sdk\/|aws-sdk$|boto3$|botocore$|github\.com\/aws\/aws-sdk-go)/, 'AWS', 'Cloud platform'),
  svc(/^(@google-cloud\/|google-cloud-)/, 'Google Cloud', 'Cloud platform', 'googlecloud'),
  svc(/^(@azure\/|azure-)/, 'Azure', 'Cloud platform'),
  svc(/^(firebase|firebase-admin|@firebase\/)/, 'Firebase', 'Backend-as-a-service', 'firebase'),
  svc(/^(@supabase\/|supabase$)/, 'Supabase', 'Backend-as-a-service', 'supabase'),
  svc(/^(appwrite|node-appwrite)$/, 'Appwrite', 'Backend-as-a-service', 'appwrite'),
  svc(/^(convex)$/, 'Convex', 'Backend-as-a-service'),
  svc(/^(openai|@ai-sdk\/openai)$/, 'OpenAI', 'AI API'),
  svc(/^(@anthropic-ai\/sdk|anthropic|@ai-sdk\/anthropic)$/, 'Anthropic', 'AI API', 'anthropic'),
  svc(/^(@google\/generative-ai|@google\/genai|google-generativeai)$/, 'Google Gemini', 'AI API', 'googlegemini'),
  svc(/^(ai)$/, 'Vercel AI SDK', 'AI SDK', 'vercel'),
  svc(/^(replicate|@huggingface\/inference|huggingface-hub|transformers)$/, 'Hugging Face / Replicate', 'AI API', 'huggingface'),
  svc(/^(@sentry\/|sentry-sdk$|raven)/, 'Sentry', 'Error tracking', 'sentry'),
  svc(/^(@datadog\/|dd-trace|datadog)/, 'Datadog', 'Observability', 'datadog'),
  svc(/^(@opentelemetry\/|opentelemetry-)/, 'OpenTelemetry', 'Observability', 'opentelemetry'),
  svc(/^(posthog-js|posthog-node|posthog)$/, 'PostHog', 'Product analytics', 'posthog'),
  svc(/^(@segment\/|analytics-node)/, 'Segment', 'Analytics'),
  svc(/^(mixpanel|mixpanel-browser)$/, 'Mixpanel', 'Analytics', 'mixpanel'),
  svc(/^(@vercel\/analytics|@vercel\/speed-insights)$/, 'Vercel Analytics', 'Analytics', 'vercel'),
  svc(/^(@clerk\/)/, 'Clerk', 'Auth', 'clerk'),
  svc(/^(next-auth|@auth\/core|@auth\/)/, 'Auth.js', 'Auth'),
  svc(/^(auth0|@auth0\/)/, 'Auth0', 'Auth', 'auth0'),
  svc(/^(passport)$/, 'Passport', 'Auth', 'passport'),
  svc(/^(@kinde-oss\/|lucia|better-auth)/, 'Auth library', 'Auth'),
  svc(/^(twilio)$/, 'Twilio', 'Messaging', 'twilio'),
  svc(/^(@sendgrid\/mail|sendgrid)$/, 'SendGrid', 'Email'),
  svc(/^(resend)$/, 'Resend', 'Email', 'resend'),
  svc(/^(nodemailer)$/, 'SMTP (Nodemailer)', 'Email'),
  svc(/^(postmark|mailgun\.js|@mailchimp\/)/, 'Email API', 'Email'),
  svc(/^(algoliasearch|@algolia\/)/, 'Algolia', 'Search', 'algolia'),
  svc(/^(meilisearch)$/, 'Meilisearch', 'Search', 'meilisearch'),
  svc(/^(pusher|pusher-js)$/, 'Pusher', 'Realtime', 'pusher'),
  svc(/^(ably)$/, 'Ably', 'Realtime'),
  svc(/^(@liveblocks\/)/, 'Liveblocks', 'Realtime'),
  svc(/^(cloudinary)$/, 'Cloudinary', 'Media', 'cloudinary'),
  svc(/^(uploadthing|@uploadthing\/)/, 'UploadThing', 'File uploads'),
  svc(/^(@vercel\/blob|@vercel\/kv|@vercel\/edge-config)$/, 'Vercel Storage', 'Storage', 'vercel'),
  svc(/^(@octokit\/|octokit|PyGithub)/, 'GitHub API', 'Developer platform', 'github'),
  svc(/^(@slack\/)/, 'Slack', 'Messaging', 'slack'),
  svc(/^(discord\.js)$/, 'Discord', 'Messaging', 'discord'),
  svc(/^(@sanity\/client|next-sanity)$/, 'Sanity', 'Headless CMS', 'sanity'),
  svc(/^(contentful)$/, 'Contentful', 'Headless CMS', 'contentful'),
  svc(/^(@notionhq\/client)$/, 'Notion', 'Productivity API', 'notion'),
  svc(/^(@googlemaps\/|@react-google-maps\/)/, 'Google Maps', 'Maps', 'googlemaps'),
  svc(/^(mapbox-gl|@mapbox\/)/, 'Mapbox', 'Maps', 'mapbox'),
  svc(/^(launchdarkly-|@launchdarkly\/)/, 'LaunchDarkly', 'Feature flags', 'launchdarkly'),
  svc(/^(@inngest\/|inngest)$/, 'Inngest', 'Background jobs'),
  svc(/^(@trigger\.dev\/)/, 'Trigger.dev', 'Background jobs'),
  svc(/^(@upstash\/qstash|@upstash\/ratelimit)$/, 'Upstash', 'Serverless data'),
  // ── Test & tooling (infra layer, low visual priority)
  fw(/^(jest|vitest|mocha|ava|pytest|@playwright\/test|cypress)$/, 'Test runner', 'Testing', 'infra'),
  fw(/^(storybook|@storybook\/react)$/, 'Storybook', 'UI workshop', 'infra', 'storybook'),
  fw(/^(eslint|biome|@biomejs\/biome|ruff|prettier)$/, 'Linting', 'Tooling', 'infra'),
];

/** Precise test-runner names for the stack list. */
const TEST_NAMES: Record<string, [string, string]> = {
  jest: ['Jest', 'jest'], vitest: ['Vitest', 'vitest'], mocha: ['Mocha', 'mocha'], ava: ['AVA', ''],
  pytest: ['pytest', 'pytest'], '@playwright/test': ['Playwright', 'playwright'], cypress: ['Cypress', 'cypress'],
  eslint: ['ESLint', 'eslint'], biome: ['Biome', 'biome'], '@biomejs/biome': ['Biome', 'biome'], ruff: ['Ruff', 'ruff'], prettier: ['Prettier', 'prettier'],
};

export function lookupPackage(pkg: string): CatalogEntry | null {
  for (const entry of CATALOG) {
    const hit = typeof entry.match === 'string' ? entry.match === pkg : entry.match.test(pkg);
    if (hit) {
      const special = TEST_NAMES[pkg];
      return special ? { ...entry, name: special[0], logo: special[1] || undefined } : entry;
    }
  }
  return null;
}

/** Bare import specifier → package name ('@scope/pkg/sub' → '@scope/pkg', 'lodash/fp' → 'lodash'). */
export function packageFromSpecifier(spec: string): string | null {
  if (!spec || spec.startsWith('.') || spec.startsWith('/') || spec.startsWith('#')) return null;
  if (/^(node|bun|deno|npm|jsr):/.test(spec)) {
    const rest = spec.replace(/^(npm|jsr):/, '');
    if (rest === spec) return null; // node: builtins
    spec = rest.replace(/@[^/]*$/, '');
  }
  const parts = spec.split('/');
  return spec.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

/** Layer colours — identical in every view so users learn the map. */
export const LAYER_COLORS: Record<Layer, string> = {
  frontend: '#a78bfa',
  api: '#22d3ee',
  service: '#34d399',
  data: '#fbbf24',
  infra: '#94a3b8',
  external: '#f472b6',
};

export const LAYER_LABELS: Record<Layer, string> = {
  frontend: 'Frontend',
  api: 'API',
  service: 'Services',
  data: 'Data',
  infra: 'Infra',
  external: 'External',
};
