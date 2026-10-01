import type * as t from '@babel/types';
import { lineAt } from '../../../lib/util';
import type { ClientCallFact, MountFact, RouteFact } from '../facts';

/**
 * Express / Fastify / Hono / Koa-router / Elysia style route registration:
 *   app.get('/users/:id', handler)       router.route('/x').get(h).post(h)
 *   fastify.route({ method: 'GET', url: '/x' })
 *   app.use('/api', usersRouter)          → mount (prefix applied to the router's file)
 * Also collects client calls (fetch('/api/x'), axios.post('/api/x')) used to link UI → API.
 */

const METHODS = new Set(['get', 'post', 'put', 'patch', 'delete', 'del', 'options', 'head', 'all']);
const CLIENT_OBJECTS = /^(axios|ky|got|http|https|client|api|apiClient|request|superagent|\$http|\$fetch|ofetch|instance|fetcher|wretch)$/i;

export interface JsRouteContext {
  content: string;
  routes: RouteFact[];
  mounts: MountFact[];
  clientCalls: ClientCallFact[];
  /** local identifier → import specifier (for mounts) */
  importedIdents: Map<string, string>;
}

/** Literal string or a template literal; template expressions become `:param`. */
export function stringValue(node: t.Node | undefined | null): string | null {
  if (!node) return null;
  if (node.type === 'StringLiteral') return node.value;
  if (node.type === 'TemplateLiteral') {
    let s = '';
    node.quasis.forEach((q, i) => {
      s += q.value.cooked ?? q.value.raw;
      if (i < node.expressions.length) {
        const e = node.expressions[i];
        s += e.type === 'Identifier' ? `:${e.name}` : ':param';
      }
    });
    return s;
  }
  return null;
}

function objectName(node: t.Node): string {
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'ThisExpression') return 'this';
  if (node.type === 'MemberExpression' && node.property.type === 'Identifier') return `${objectName(node.object)}.${node.property.name}`;
  if (node.type === 'CallExpression') return objectName(node.callee);
  return '?';
}

function handlerName(args: t.Node[]): string | undefined {
  const last = args[args.length - 1];
  if (!last) return undefined;
  if (last.type === 'Identifier') return last.name;
  if (last.type === 'MemberExpression') return objectName(last);
  if (last.type === 'CallExpression') return objectName(last.callee) + '()';
  if (last.type === 'ArrowFunctionExpression' || last.type === 'FunctionExpression') return 'inline handler';
  return undefined;
}

const looksLikePath = (s: string) => s.startsWith('/') || s === '*';
const looksLikeApiPath = (s: string) => /^(\/|https?:\/\/[^/]+\/)/.test(s) && !/\.(png|jpe?g|svg|css|js|ico|woff2?)$/.test(s);

export function visitJsRouteNode(node: t.Node, ctx: JsRouteContext) {
  if (node.type !== 'CallExpression') return;
  const callee = node.callee;
  const line = node.loc?.start.line ?? 1;

  // fetch('/api/x', { method: 'POST' })
  if (callee.type === 'Identifier' && (callee.name === 'fetch' || callee.name === '$fetch' || callee.name === 'useFetch' || callee.name === 'useSWR')) {
    const p = stringValue(node.arguments[0] as t.Node);
    if (p && looksLikeApiPath(p)) {
      let method = 'GET';
      const opts = node.arguments[1];
      if (opts?.type === 'ObjectExpression') {
        for (const prop of opts.properties) {
          if (prop.type === 'ObjectProperty' && prop.key.type === 'Identifier' && prop.key.name === 'method') {
            method = (stringValue(prop.value as t.Node) ?? 'GET').toUpperCase();
          }
        }
      }
      ctx.clientCalls.push({ method, path: p, line, snippet: lineAt(ctx.content, line) });
    }
    return;
  }

  if (callee.type !== 'MemberExpression' || callee.property.type !== 'Identifier') return;
  const prop = callee.property.name;
  const objName = objectName(callee.object);
  const first = node.arguments[0] as t.Node | undefined;
  const firstStr = stringValue(first);

  // axios.get('/api/x')
  if (CLIENT_OBJECTS.test(objName.split('.').pop() ?? '') && METHODS.has(prop.toLowerCase())) {
    if (firstStr && looksLikeApiPath(firstStr)) {
      ctx.clientCalls.push({ method: prop.toUpperCase(), path: firstStr, line, snippet: lineAt(ctx.content, line) });
    }
    return;
  }

  // app.get('/x', handler) / router.post(...)
  if (METHODS.has(prop) && firstStr !== null && looksLikePath(firstStr) && node.arguments.length >= 2) {
    // router.route('/x').get(h) is handled below; here the receiver is a plain object
    ctx.routes.push({
      method: prop === 'del' ? 'DELETE' : prop === 'all' ? 'ANY' : prop.toUpperCase(),
      path: firstStr,
      line,
      framework: 'express-style',
      handler: handlerName(node.arguments as t.Node[]),
      snippet: lineAt(ctx.content, line),
    });
    return;
  }

  // router.route('/x').get(h).post(h)
  if (METHODS.has(prop)) {
    let inner: t.Node = callee.object;
    while (inner.type === 'CallExpression' && inner.callee.type === 'MemberExpression') {
      const ip = inner.callee.property;
      if (ip.type === 'Identifier' && ip.name === 'route') {
        const p = stringValue(inner.arguments[0] as t.Node);
        if (p && looksLikePath(p)) {
          ctx.routes.push({
            method: prop.toUpperCase(), path: p, line, framework: 'express-style',
            handler: handlerName(node.arguments as t.Node[]), snippet: lineAt(ctx.content, line),
          });
        }
        break;
      }
      inner = inner.callee.object;
    }
    return;
  }

  // fastify.route({ method: 'GET', url: '/x', handler })
  if (prop === 'route' && first?.type === 'ObjectExpression') {
    let methods: string[] = [];
    let url: string | null = null;
    for (const p of first.properties) {
      if (p.type !== 'ObjectProperty' || p.key.type !== 'Identifier') continue;
      if (p.key.name === 'url' || p.key.name === 'path') url = stringValue(p.value as t.Node);
      if (p.key.name === 'method') {
        const v = p.value as t.Node;
        if (v.type === 'ArrayExpression') methods = v.elements.map((e) => stringValue(e as t.Node) ?? '').filter(Boolean);
        else methods = [stringValue(v) ?? 'ANY'];
      }
    }
    if (url) for (const m of methods.length ? methods : ['ANY']) {
      ctx.routes.push({ method: m.toUpperCase(), path: url, line, framework: 'fastify', snippet: lineAt(ctx.content, line) });
    }
    return;
  }

  // app.use('/api', router)  |  app.route('/api', subApp) (Hono)  |  fastify.register(plugin, { prefix: '/x' })
  if ((prop === 'use' || prop === 'route') && firstStr && looksLikePath(firstStr) && node.arguments.length >= 2) {
    for (const arg of node.arguments.slice(1)) {
      const a = arg as t.Node;
      let ident: string | null = null;
      if (a.type === 'Identifier') ident = a.name;
      else if (a.type === 'CallExpression' && a.callee.type === 'Identifier' && a.callee.name === 'require') {
        const spec = stringValue(a.arguments[0] as t.Node);
        if (spec) ctx.mounts.push({ prefix: firstStr, spec, line });
        continue;
      }
      if (ident && ctx.importedIdents.has(ident)) ctx.mounts.push({ prefix: firstStr, spec: ctx.importedIdents.get(ident)!, line });
    }
    return;
  }
  if (prop === 'register' && node.arguments.length >= 2) {
    const plugin = node.arguments[0] as t.Node;
    const opts = node.arguments[1] as t.Node;
    if (plugin.type === 'Identifier' && opts.type === 'ObjectExpression' && ctx.importedIdents.has(plugin.name)) {
      for (const p of opts.properties) {
        if (p.type === 'ObjectProperty' && p.key.type === 'Identifier' && p.key.name === 'prefix') {
          const prefix = stringValue(p.value as t.Node);
          if (prefix) ctx.mounts.push({ prefix, spec: ctx.importedIdents.get(plugin.name)!, line });
        }
      }
    }
  }
}
