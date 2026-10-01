import { fetchRaw } from '../sources/github';

/**
 * In-memory file contents for the code panel. Filled while scanning; when an
 * analysis is reopened from cache, files are fetched lazily from raw.githubusercontent.com.
 */
const contents = new Map<string, string>();
const MAX_BYTES = 40 * 1024 * 1024;
let bytes = 0;

export function rememberContent(key: string, text: string) {
  if (bytes + text.length > MAX_BYTES || contents.has(key)) return;
  contents.set(key, text);
  bytes += text.length;
}

export function clearContents() {
  contents.clear();
  bytes = 0;
}

export async function getContent(owner: string, repo: string, sha: string, path: string): Promise<string | null> {
  const key = `${owner}/${repo}@${sha}:${path}`;
  const hit = contents.get(key);
  if (hit !== undefined) return hit;
  const text = await fetchRaw(owner, repo, sha, path);
  if (text !== null) rememberContent(key, text);
  return text;
}

export const contentKey = (owner: string, repo: string, sha: string, path: string) => `${owner}/${repo}@${sha}:${path}`;
