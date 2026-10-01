/** What the parse workers extract from one source file. Plain data (structured-clone safe). */

export interface ImportFact {
  spec: string;
  line: number;
}

export interface RouteFact {
  method: string;
  path: string;
  line: number;
  framework: string;
  handler?: string;
  snippet: string;
}

/** `app.use('/api', usersRouter)` — routes in the file `spec` resolves to get `prefix` prepended. */
export interface MountFact {
  prefix: string;
  spec: string;
  line: number;
}

/** A client-side call to an API path, e.g. fetch('/api/users') — links frontend to endpoints. */
export interface ClientCallFact {
  method: string;
  path: string;
  line: number;
  snippet: string;
}

export interface FileFacts {
  path: string;
  loc: number;
  imports: ImportFact[];
  exports: string[];
  routes: RouteFact[];
  mounts: MountFact[];
  clientCalls: ClientCallFact[];
  hasJsx: boolean;
  parser: 'babel' | 'regex' | 'none';
  parseError?: string;
}

export interface SourceFile {
  path: string;
  content: string;
}

export function emptyFacts(path: string, content: string): FileFacts {
  return {
    path,
    loc: content ? content.split('\n').length : 0,
    imports: [],
    exports: [],
    routes: [],
    mounts: [],
    clientCalls: [],
    hasJsx: false,
    parser: 'none',
  };
}

/** Join route prefixes without doubling slashes. */
export function joinRoute(prefix: string, path: string): string {
  const joined = `/${prefix}/${path}`.replace(/\/{2,}/g, '/');
  return joined.length > 1 ? joined.replace(/\/$/, '') : joined;
}
