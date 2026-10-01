import type * as t from '@babel/types';
import { lineAt } from '../../../lib/util';
import { joinRoute, type RouteFact } from '../facts';
import { stringValue } from './express';

/** NestJS: @Controller('users') class + @Get(':id') methods. */

const DECORATOR_METHODS: Record<string, string> = {
  Get: 'GET', Post: 'POST', Put: 'PUT', Patch: 'PATCH', Delete: 'DELETE', All: 'ANY', Options: 'OPTIONS', Head: 'HEAD',
};

function decoratorCall(d: t.Decorator): { name: string; arg: string | null } | null {
  const e = d.expression;
  if (e.type === 'CallExpression' && e.callee.type === 'Identifier') {
    const a = e.arguments[0] as t.Node | undefined;
    let arg = stringValue(a);
    if (!arg && a?.type === 'ObjectExpression') {
      for (const p of a.properties) {
        if (p.type === 'ObjectProperty' && p.key.type === 'Identifier' && p.key.name === 'path') arg = stringValue(p.value as t.Node);
      }
    }
    return { name: e.callee.name, arg };
  }
  if (e.type === 'Identifier') return { name: e.name, arg: null };
  return null;
}

export function visitNestClass(node: t.Node, content: string, routes: RouteFact[]) {
  if (node.type !== 'ClassDeclaration' && node.type !== 'ClassExpression') return;
  const controller = (node.decorators ?? []).map(decoratorCall).find((d) => d?.name === 'Controller');
  if (!controller) return;
  const prefix = controller.arg ?? '';
  for (const member of node.body.body) {
    if (member.type !== 'ClassMethod' || !member.decorators) continue;
    for (const d of member.decorators) {
      const call = decoratorCall(d);
      if (!call || !DECORATOR_METHODS[call.name]) continue;
      const line = d.loc?.start.line ?? 1;
      routes.push({
        method: DECORATOR_METHODS[call.name],
        path: joinRoute(prefix, call.arg ?? ''),
        line,
        framework: 'NestJS',
        handler: member.key.type === 'Identifier' ? member.key.name : undefined,
        snippet: lineAt(content, line),
      });
    }
  }
}
