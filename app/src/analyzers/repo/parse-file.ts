import { extname } from '../../lib/util';
import { emptyFacts, type FileFacts, type SourceFile } from './facts';
import { parseJsTs } from './imports/js-ts';
import { parseGo, parseGraphqlFile, parseJvm, parsePhp, parseRuby } from './imports/others';
import { parseC, parseRust } from './imports/native';
import { parsePython } from './imports/python';
import { extractGraphql } from './routes/graphql';

/** Language dispatch for one source file. Runs inside the parse workers (or directly in Node). */
export function parseFile({ path, content }: SourceFile): FileFacts {
  try {
    const ext = extname(path);
    switch (ext) {
      case '.ts': case '.tsx': case '.mts': case '.cts':
      case '.js': case '.jsx': case '.mjs': case '.cjs':
      case '.vue': case '.svelte': case '.astro': {
        const facts = parseJsTs(path, content);
        if (content.includes('type Query') || content.includes('type Mutation')) facts.routes.push(...extractGraphql(content));
        return facts;
      }
      case '.py': return parsePython(path, content);
      case '.go': return parseGo(path, content);
      case '.java': case '.kt': return parseJvm(path, content);
      case '.rb': return parseRuby(path, content);
      case '.php': return parsePhp(path, content);
      case '.graphql': case '.gql': return parseGraphqlFile(path, content);
      case '.c': case '.h': case '.cc': case '.cpp': case '.cxx': case '.hpp': case '.hh': return parseC(path, content);
      case '.rs': return parseRust(path, content);
      default: return emptyFacts(path, content);
    }
  } catch (err) {
    const facts = emptyFacts(path, content);
    facts.parseError = String((err as Error)?.message ?? err).slice(0, 160);
    return facts;
  }
}

export function parseBatch(files: SourceFile[]): FileFacts[] {
  return files.map(parseFile);
}
