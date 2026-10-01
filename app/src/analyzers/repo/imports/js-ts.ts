import { parse, type ParserPlugin } from '@babel/parser';
import type * as t from '@babel/types';
import { extname, lineAt, lineOf } from '../../../lib/util';
import { emptyFacts, type FileFacts } from '../facts';
import { stringValue, visitJsRouteNode, type JsRouteContext } from '../routes/express';
import { visitNestClass } from '../routes/nestjs';

/**
 * JS/TS fact extraction with @babel/parser (error-recovering), falling back to
 * regexes when a file will not parse. Vue/Svelte/Astro: only their script blocks.
 */

/** Pull script blocks out of SFCs, padded with newlines so line numbers still match. */
export function extractScript(path: string, content: string): string {
  const ext = extname(path);
  if (ext === '.vue' || ext === '.svelte') {
    let out = '';
    const re = /<script\b[^>]*>([\s\S]*?)<\/script>/g;
    let m: RegExpExecArray | null;
    let cursor = 0;
    while ((m = re.exec(content))) {
      const start = m.index + m[0].indexOf('>') + 1;
      out += '\n'.repeat(lineOf(content, start) - lineOf(content, cursor)) + m[1];
      cursor = start + m[1].length;
    }
    return out;
  }
  if (ext === '.astro') {
    const fm = content.match(/^---\n([\s\S]*?)\n---/);
    return fm ? '\n' + fm[1] : '';
  }
  return content;
}

function pluginsFor(path: string): ParserPlugin[] {
  const ext = extname(path);
  const base: ParserPlugin[] = ['decorators-legacy', 'topLevelAwait', 'importAttributes', 'explicitResourceManagement', 'doExpressions'];
  if (ext === '.ts' || ext === '.mts' || ext === '.cts') return ['typescript', ...base];
  if (ext === '.tsx') return ['typescript', 'jsx', ...base];
  if (ext === '.vue' || ext === '.svelte' || ext === '.astro') return ['typescript', ...base];
  return ['jsx', ...base];
}

const SKIP_KEYS = new Set(['loc', 'start', 'end', 'leadingComments', 'trailingComments', 'innerComments', 'extra', 'range']);

function walk(node: t.Node, visit: (n: t.Node) => void) {
  const stack: t.Node[] = [node];
  while (stack.length) {
    const n = stack.pop()!;
    visit(n);
    for (const key in n) {
      if (SKIP_KEYS.has(key)) continue;
      const v = (n as unknown as Record<string, unknown>)[key];
      if (Array.isArray(v)) {
        for (let i = v.length - 1; i >= 0; i--) {
          const c = v[i];
          if (c && typeof c === 'object' && typeof (c as t.Node).type === 'string') stack.push(c as t.Node);
        }
      } else if (v && typeof v === 'object' && typeof (v as t.Node).type === 'string') {
        stack.push(v as t.Node);
      }
    }
  }
}

export function parseJsTs(path: string, original: string): FileFacts {
  const facts = emptyFacts(path, original);
  const content = extractScript(path, original);
  if (!content.trim()) return facts;

  let ast: t.File;
  try {
    ast = parse(content, {
      sourceType: 'unambiguous',
      plugins: pluginsFor(path),
      errorRecovery: true,
      allowReturnOutsideFunction: true,
      allowImportExportEverywhere: true,
      allowUndeclaredExports: true,
    }) as unknown as t.File;
  } catch (err) {
    const fallback = regexJs(path, original);
    fallback.parseError = (err as Error).message.slice(0, 160);
    return fallback;
  }

  facts.parser = 'babel';
  const ctx: JsRouteContext = {
    content: original,
    routes: facts.routes,
    mounts: facts.mounts,
    clientCalls: facts.clientCalls,
    importedIdents: new Map(),
  };
  const addImport = (spec: string | null, node: t.Node) => {
    if (spec) facts.imports.push({ spec, line: node.loc?.start.line ?? 1 });
  };

  // Top-level pass: imports/exports + identifier → specifier map for router mounts.
  for (const stmt of ast.program.body) {
    if (stmt.type === 'ImportDeclaration') {
      addImport(stmt.source.value, stmt);
      for (const s of stmt.specifiers) ctx.importedIdents.set(s.local.name, stmt.source.value);
    } else if (stmt.type === 'ExportNamedDeclaration') {
      if (stmt.source) addImport(stmt.source.value, stmt);
      const d = stmt.declaration;
      if (d?.type === 'FunctionDeclaration' && d.id) facts.exports.push(d.id.name);
      else if (d?.type === 'VariableDeclaration') {
        for (const decl of d.declarations) if (decl.id.type === 'Identifier') facts.exports.push(decl.id.name);
      } else if (d?.type === 'ClassDeclaration' && d.id) facts.exports.push(d.id.name);
      for (const s of stmt.specifiers) {
        if (s.type === 'ExportSpecifier') facts.exports.push(s.exported.type === 'Identifier' ? s.exported.name : s.exported.value);
      }
    } else if (stmt.type === 'ExportAllDeclaration') {
      addImport(stmt.source.value, stmt);
    } else if (stmt.type === 'ExportDefaultDeclaration') {
      facts.exports.push('default');
    } else if (stmt.type === 'TSImportEqualsDeclaration' && stmt.moduleReference.type === 'TSExternalModuleReference') {
      addImport(stmt.moduleReference.expression.value, stmt);
      ctx.importedIdents.set(stmt.id.name, stmt.moduleReference.expression.value);
    } else if (stmt.type === 'VariableDeclaration') {
      // const users = require('./users')
      for (const decl of stmt.declarations) {
        const init = decl.init;
        if (decl.id.type === 'Identifier' && init?.type === 'CallExpression' && init.callee.type === 'Identifier' && init.callee.name === 'require') {
          const spec = stringValue(init.arguments[0] as t.Node);
          if (spec) ctx.importedIdents.set(decl.id.name, spec);
        }
      }
    }
  }

  walk(ast.program, (node) => {
    if (node.type === 'CallExpression') {
      const callee = node.callee;
      if ((callee.type === 'Identifier' && callee.name === 'require') || callee.type === 'Import') {
        addImport(stringValue(node.arguments[0] as t.Node), node);
      }
      visitJsRouteNode(node, ctx);
    } else if (node.type === 'ImportExpression') {
      addImport(stringValue(node.source as t.Node), node);
    } else if (node.type === 'JSXElement' || node.type === 'JSXFragment') {
      facts.hasJsx = true;
    } else if (node.type === 'ClassDeclaration' || node.type === 'ClassExpression') {
      visitNestClass(node, original, facts.routes);
    } else if (node.type === 'AssignmentExpression' && node.left.type === 'MemberExpression') {
      // CommonJS: module.exports = / exports.GET =
      const l = node.left;
      if (l.object.type === 'Identifier' && l.object.name === 'exports' && l.property.type === 'Identifier') facts.exports.push(l.property.name);
      if (l.object.type === 'Identifier' && l.object.name === 'module' && l.property.type === 'Identifier' && l.property.name === 'exports') facts.exports.push('default');
    }
  });

  if (/\.(vue|svelte|astro)$/.test(path)) facts.hasJsx = true; // components by definition
  dedupeImports(facts);
  return facts;
}

function dedupeImports(facts: FileFacts) {
  const seen = new Set<string>();
  facts.imports = facts.imports.filter((i) => (seen.has(i.spec) ? false : (seen.add(i.spec), true)));
}

const IMPORT_RE = /(?:import\s[^'"]*?from\s*|import\s*\(\s*|import\s+|require\s*\(\s*|export\s[^'"]*?from\s*)['"]([^'"]+)['"]/g;
const ROUTE_RE = /\b(?:app|router|server|api|route|r)\.(get|post|put|patch|delete|all)\(\s*['"`](\/[^'"`]*)['"`]/g;

/** Fallback for files Babel refuses: still gives imports and obvious routes. */
export function regexJs(path: string, content: string): FileFacts {
  const facts = emptyFacts(path, content);
  facts.parser = 'regex';
  for (const m of content.matchAll(IMPORT_RE)) facts.imports.push({ spec: m[1], line: lineOf(content, m.index ?? 0) });
  for (const m of content.matchAll(ROUTE_RE)) {
    const line = lineOf(content, m.index ?? 0);
    facts.routes.push({ method: m[1].toUpperCase(), path: m[2], line, framework: 'express-style', snippet: lineAt(content, line) });
  }
  for (const m of content.matchAll(/export\s+(?:async\s+)?(?:function|const|let|class)\s+(\w+)/g)) facts.exports.push(m[1]);
  facts.hasJsx = /<[A-Z][\w.]*[\s/>]/.test(content) || /\.(tsx|jsx|vue|svelte)$/.test(path);
  dedupeImports(facts);
  return facts;
}
