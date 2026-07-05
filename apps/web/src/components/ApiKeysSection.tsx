'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export interface ApiKeyRow {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

export function ApiKeysSection({ apiKeys }: { apiKeys: ApiKeyRow[] }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [readOnly, setReadOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function createKey() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, scopes: readOnly ? ['read'] : ['read', 'write'] }),
      });
      if (!res.ok) throw new Error(await res.text());
      const { key } = await res.json();
      setCreatedKey(key);
      setCopied(false);
      setName('');
      router.refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function revokeKey(id: string, keyName: string) {
    if (!confirm(`Revoke "${keyName}"? Anything using it will stop working immediately.`)) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/keys/${id}`, { method: 'DELETE' });
    setBusy(false);
    if (!res.ok) return setError(await res.text());
    router.refresh();
  }

  return (
    <section className="space-y-3 rounded-[14px] border border-studio bg-studio-panel p-6">
      <h2 className="text-lg font-semibold text-studio-bright">API keys</h2>
      <p className="text-xs text-studio-muted">
        For third-party integrations and AI agents (REST API + MCP). Keys have full access to the
        pipeline — treat them like passwords. See <code>docs/API.md</code> for how to connect.
      </p>
      {error && <p className="rounded-[8px] bg-red-950 p-2 text-xs text-red-300">{error}</p>}

      {createdKey && (
        <div className="space-y-2 rounded-[8px] border border-[#3a2f16] bg-[#2a2310] p-3">
          <p className="text-xs font-semibold text-studio-accent">
            Copy this key now — it will not be shown again.
          </p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 break-all rounded-[6px] bg-studio-code p-2 text-xs text-studio-accent">
              {createdKey}
            </code>
            <button
              onClick={async () => {
                await navigator.clipboard.writeText(createdKey);
                setCopied(true);
              }}
              className="studio-lift shrink-0 rounded-[9px] bg-studio-accent px-3 py-1.5 text-xs font-semibold text-studio-on-accent"
            >
              {copied ? 'Copied ✓' : 'Copy'}
            </button>
            <button
              onClick={() => setCreatedKey(null)}
              className="shrink-0 rounded-[9px] border border-studio-border-strong px-3 py-1.5 text-xs text-studio-sub hover:bg-studio-inset"
            >
              Done
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Key name (e.g. Zapier, Claude)"
          className="w-64 rounded-[8px] border border-studio-border-strong bg-studio-inset px-3 py-1.5 text-sm"
        />
        <label className="flex items-center gap-1.5 text-xs text-studio-sub">
          <input type="checkbox" checked={readOnly} onChange={(e) => setReadOnly(e.target.checked)} />
          read-only
        </label>
        <button
          onClick={createKey}
          disabled={busy || !name.trim()}
          className="studio-lift rounded-[9px] bg-studio-accent px-3 py-1.5 text-sm font-semibold text-studio-on-accent disabled:opacity-50"
        >
          {busy ? 'Working…' : 'Create key'}
        </button>
      </div>

      {apiKeys.length > 0 && (
        <ul className="space-y-1">
          {apiKeys.map((k) => (
            <li key={k.id} className="flex flex-wrap items-center gap-2 rounded-[10px] border border-studio bg-studio-card px-3 py-2.5 text-xs">
              <b>{k.name}</b>
              <code className="text-studio-muted">{k.key_prefix}…</code>
              <span className="text-studio-muted">{k.scopes.join(', ')}</span>
              {k.revoked_at ? (
                <span className="rounded-[5px] bg-red-900 px-1.5 text-red-200">revoked</span>
              ) : (
                <span className="text-studio-faint">
                  {k.last_used_at
                    ? `last used ${new Date(k.last_used_at).toLocaleString()}`
                    : 'never used'}
                </span>
              )}
              {!k.revoked_at && (
                <button
                  onClick={() => revokeKey(k.id, k.name)}
                  disabled={busy}
                  className="ml-auto text-studio-muted hover:text-red-400"
                >
                  revoke
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
