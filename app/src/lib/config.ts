/** Deployment-specific settings. Override with VITE_* env vars at build time. */
export const SITE_URL: string = import.meta.env?.VITE_SITE_URL ?? (typeof location !== 'undefined' ? location.origin : 'https://stackscope.dev');

/** Where the Stackscope source lives (used for "report a missed route" and the GitHub link). */
export const PROJECT_REPO_URL: string = import.meta.env?.VITE_PROJECT_REPO_URL ?? 'https://github.com/stackscope/stackscope';

export const EXAMPLES = [
  'vercel/next.js',
  'expressjs/express',
  'fastapi/full-stack-fastapi-template',
  'https://github.com/supabase/supabase/tree/master/apps/studio',
  'excalidraw/excalidraw',
  'https://vercel.com',
  'gin-gonic/gin',
  'https://github.com',
  'calcom/cal.com',
  'https://linear.app',
];
