import { useState } from 'react';
import { useUi } from '../store/ui';
import { Icon } from './Icon';
import { Modal } from './Modal';

/** Optional GitHub PAT — kept in memory + sessionStorage only, sent only to api.github.com. */
export function TokenDialog() {
  const { tokenOpen, setTokenOpen, saveToken, hasToken } = useUi();
  const [value, setValue] = useState('');
  const close = () => {
    setTokenOpen(false);
    setValue('');
  };
  return (
    <Modal open={tokenOpen} onClose={close} label="GitHub token">
      <form
        className="p-5"
        onSubmit={(e) => {
          e.preventDefault();
          saveToken(value.trim() || null);
          close();
        }}
      >
        <div className="mb-1 flex items-center gap-2 text-base font-medium">
          <Icon name="key" className="text-accent" /> GitHub access token
        </div>
        <p className="mb-4 text-sm text-muted">
          Without a token GitHub allows 60 API requests per hour per IP. Stackscope uses only <b>2 per repo</b>, so you rarely need one.
          A token raises the limit to 5,000/hour. Use a fine-grained token with <b>no permissions</b> (public repos only).
        </p>
        <input
          autoFocus
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={hasToken ? '•••••••• (a token is active)' : 'github_pat_…'}
          className="mono focus-ring w-full rounded-lg border border-line bg-bg-2 px-3 py-2.5 text-sm outline-none"
          autoComplete="off"
          spellCheck={false}
        />
        <div className="mt-3 flex items-start gap-2 text-xs text-faint">
          <Icon name="shield" size={14} className="mt-0.5 shrink-0" />
          Stored in this tab&apos;s sessionStorage only and sent only to api.github.com. It never reaches a Stackscope server.
        </div>
        <div className="mt-5 flex justify-end gap-2">
          {hasToken && (
            <button type="button" onClick={() => { saveToken(null); close(); }} className="focus-ring rounded-lg px-3 py-2 text-sm text-danger hover:bg-panel-hover">
              Remove token
            </button>
          )}
          <button type="button" onClick={close} className="focus-ring rounded-lg px-3 py-2 text-sm text-muted hover:text-text">
            Cancel
          </button>
          <button type="submit" className="focus-ring rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-ink">
            Save for this tab
          </button>
        </div>
      </form>
    </Modal>
  );
}
