import { lineOf } from '../../../lib/util';
import { emptyFacts, type FileFacts } from '../facts';
import { extractGo } from '../routes/go';
import { extractGraphql } from '../routes/graphql';
import { extractPhp, extractRails } from '../routes/rails-laravel';
import { extractSpring } from '../routes/spring';

export function parseGo(path: string, content: string): FileFacts {
  const facts = emptyFacts(path, content);
  facts.parser = 'regex';
  for (const m of content.matchAll(/^import\s+(?:\w+\s+)?"([^"]+)"/gm)) facts.imports.push({ spec: m[1], line: lineOf(content, m.index ?? 0) });
  for (const block of content.matchAll(/^import\s*\(([\s\S]*?)\)/gm)) {
    const base = block.index ?? 0;
    for (const m of block[1].matchAll(/^\s*(?:[\w.]+\s+)?"([^"]+)"/gm)) {
      facts.imports.push({ spec: m[1], line: lineOf(content, base + (m.index ?? 0)) + 1 });
    }
  }
  for (const m of content.matchAll(/^func\s+(?:\([^)]*\)\s*)?([A-Z]\w*)/gm)) facts.exports.push(m[1]);
  facts.routes.push(...extractGo(content));
  return facts;
}

export function parseJvm(path: string, content: string): FileFacts {
  const facts = emptyFacts(path, content);
  facts.parser = 'regex';
  for (const m of content.matchAll(/^import\s+(?:static\s+)?([\w.]+?)(?:\.\*)?;?\s*$/gm)) {
    facts.imports.push({ spec: m[1], line: lineOf(content, m.index ?? 0) });
  }
  for (const m of content.matchAll(/\b(?:public\s+)?(?:class|interface|object|enum)\s+(\w+)/g)) facts.exports.push(m[1]);
  facts.routes.push(...extractSpring(content));
  return facts;
}

export function parseRuby(path: string, content: string): FileFacts {
  const facts = emptyFacts(path, content);
  facts.parser = 'regex';
  for (const m of content.matchAll(/^\s*require(_relative)?\s+['"]([^'"]+)['"]/gm)) {
    facts.imports.push({ spec: m[1] ? `./${m[2]}` : m[2], line: lineOf(content, m.index ?? 0) });
  }
  for (const m of content.matchAll(/^\s*class\s+(\w+)/gm)) facts.exports.push(m[1]);
  facts.routes.push(...extractRails(path, content));
  return facts;
}

export function parsePhp(path: string, content: string): FileFacts {
  const facts = emptyFacts(path, content);
  facts.parser = 'regex';
  for (const m of content.matchAll(/^use\s+([\w\\]+)(?:\s+as\s+\w+)?;/gm)) facts.imports.push({ spec: m[1], line: lineOf(content, m.index ?? 0) });
  for (const m of content.matchAll(/(?:require|include)(?:_once)?\s*\(?\s*__DIR__\s*\.\s*['"]([^'"]+)['"]/g)) {
    facts.imports.push({ spec: `.${m[1]}`, line: lineOf(content, m.index ?? 0) });
  }
  for (const m of content.matchAll(/\bclass\s+(\w+)/g)) facts.exports.push(m[1]);
  facts.routes.push(...extractPhp(content));
  return facts;
}

export function parseGraphqlFile(path: string, content: string): FileFacts {
  const facts = emptyFacts(path, content);
  facts.parser = 'regex';
  facts.routes.push(...extractGraphql(content));
  return facts;
}
