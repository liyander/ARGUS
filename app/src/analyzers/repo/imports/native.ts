import { lineAt, lineOf } from '../../../lib/util';
import { emptyFacts, type FileFacts } from '../facts';

/** C / C++: `#include "local.h"` and `#include <linux/sched.h>` (system includes prefixed with `<`). */
export function parseC(path: string, content: string): FileFacts {
  const facts = emptyFacts(path, content);
  facts.parser = 'regex';
  for (const m of content.matchAll(/^[ \t]*#[ \t]*include[ \t]*(["<])([^">]+)[">]/gm)) {
    facts.imports.push({ spec: m[1] === '<' ? `<${m[2]}` : m[2], line: lineOf(content, m.index ?? 0) });
  }
  for (const m of content.matchAll(/^(?:static\s+)?(?:inline\s+)?[\w\s*]+?\b(\w+)\s*\([^;{]*\)\s*\{/gm)) {
    if (!['if', 'for', 'while', 'switch', 'return'].includes(m[1])) facts.exports.push(m[1]);
    if (facts.exports.length > 200) break;
  }
  return facts;
}

/** Rust: `mod x;`, `use crate::a::b`, plus Axum `.route("/x", get(h))` and Actix `#[get("/x")]`. */
export function parseRust(path: string, original: string): FileFacts {
  const facts = emptyFacts(path, original);
  // doc comments are full of example routes: blank comment lines but keep line numbers
  const content = original
    .replace(/^[ \t]*\/\/.*$/gm, (m) => ' '.repeat(m.length))
    // in-file unit tests (usually at the end) register sample routes too
    .replace(/#\[cfg\(test\)\][\s\S]*$/, (m) => m.replace(/[^\n]/g, ' '));
  facts.parser = 'regex';
  for (const m of content.matchAll(/^[ \t]*(?:pub(?:\([^)]*\))?\s+)?mod\s+(\w+)\s*;/gm)) facts.imports.push({ spec: `mod:${m[1]}`, line: lineOf(content, m.index ?? 0) });
  for (const m of content.matchAll(/^[ \t]*(?:pub\s+)?use\s+(crate|super|self|[\w]+)::([\w:]+)/gm)) facts.imports.push({ spec: `${m[1]}::${m[2]}`, line: lineOf(content, m.index ?? 0) });
  for (const m of content.matchAll(/^[ \t]*(?:pub\s+)?(?:async\s+)?fn\s+(\w+)/gm)) facts.exports.push(m[1]);
  for (const m of content.matchAll(/\.route\(\s*"([^"]+)"\s*,\s*((?:get|post|put|patch|delete|any)\([^)]*\)(?:\s*\.\s*(?:get|post|put|patch|delete)\([^)]*\))*)/g)) {
    const line = lineOf(content, m.index ?? 0);
    for (const mm of m[2].matchAll(/(get|post|put|patch|delete|any)\(\s*([\w:]*)/g)) {
      facts.routes.push({ method: mm[1] === 'any' ? 'ANY' : mm[1].toUpperCase(), path: m[1].replace(/\{(\w+)\}/g, ':$1'), line, framework: 'Axum', handler: mm[2] || undefined, snippet: lineAt(original, line) });
    }
  }
  for (const m of content.matchAll(/#\[(get|post|put|patch|delete)\(\s*"([^"]+)"/g)) {
    const line = lineOf(content, m.index ?? 0);
    const handler = content.slice(m.index ?? 0).match(/fn\s+(\w+)/)?.[1];
    facts.routes.push({ method: m[1].toUpperCase(), path: m[2].replace(/\{(\w+)\}/g, ':$1'), line, framework: 'Actix/Rocket', handler, snippet: lineAt(original, line) });
  }
  return facts;
}
