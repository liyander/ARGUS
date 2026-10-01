import type { EdgeFetchResponse } from '../../../edge/src/handler';

export type { EdgeFetchResponse };

/** Where the URL-fetch edge function lives. Same-origin `/api/fetch` in dev and on Cloudflare Pages. */
const EDGE_URL: string = import.meta.env?.VITE_EDGE_URL ?? '/api/fetch';

export async function edgeFetch(url: string, signal?: AbortSignal): Promise<EdgeFetchResponse> {
  let res: Response;
  try {
    res = await fetch(`${EDGE_URL}?url=${encodeURIComponent(url)}`, { signal });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new Error('Could not reach the Stackscope edge function. URL mode needs it deployed (see README).');
  }
  const text = await res.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    throw new Error(`Edge function returned ${res.status} (not JSON). Is /api/fetch deployed?`);
  }
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `Edge function error ${res.status}`);
  return body as EdgeFetchResponse;
}

/** Normalise user input to an absolute URL, or null. */
export function normalizeUrlInput(raw: string): string | null {
  let s = raw.trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    if (!u.hostname.includes('.')) return null;
    return u.toString();
  } catch {
    return null;
  }
}
