'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { DashboardUser } from '@/lib/users';

export function UsersSection({ users }: { users: DashboardUser[] }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invited, setInvited] = useState<string | null>(null);

  async function invite() {
    setBusy(true);
    setError(null);
    setInvited(null);
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) throw new Error(await res.text());
      setInvited(email.trim());
      setEmail('');
      router.refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove(user: DashboardUser) {
    if (!confirm(`Remove ${user.email}? They will lose access on their next page load.`)) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/users/${user.id}`, { method: 'DELETE' });
    setBusy(false);
    if (!res.ok) return setError(await res.text());
    router.refresh();
  }

  return (
    <section className="space-y-3 rounded-[14px] border border-studio-border bg-studio-panel p-6">
      <h2 className="text-lg font-semibold text-studio-bright">Users &amp; reviewers</h2>
      <p className="text-xs text-studio-muted">
        Client reviewers sign in with an emailed code — no password, no per-video links. They see
        the pipeline read-only and can approve, reject and comment. Operators have full access.
      </p>
      {error && <p className="rounded-[8px] bg-red-950 p-2 text-xs text-red-300">{error}</p>}
      {invited && (
        <p className="rounded-[8px] border border-[#3a2f16] bg-[#2a2310] p-2 text-xs text-studio-accent">
          Invite sent to {invited}. They can also sign in any time via “Email code” on the login
          page.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="reviewer@client.com"
          className="w-64 rounded-[8px] border border-studio-border-strong bg-studio-inset px-3 py-1.5 text-sm"
        />
        <button
          onClick={invite}
          disabled={busy || !email.trim()}
          className="studio-lift rounded-[9px] bg-studio-accent px-3 py-1.5 text-sm font-semibold text-studio-on-accent disabled:opacity-50"
        >
          {busy ? 'Working…' : 'Invite reviewer'}
        </button>
      </div>

      {users.length > 0 && (
        <ul className="space-y-1">
          {users.map((u) => (
            <li
              key={u.id}
              className="flex flex-wrap items-center gap-2 rounded-[10px] border border-studio-border bg-studio-card px-3 py-2.5 text-xs"
            >
              <b>{u.email}</b>
              <span
                className={`rounded-[5px] px-1.5 py-0.5 font-medium ${
                  u.role === 'operator'
                    ? 'bg-studio-inset text-studio-sub'
                    : 'bg-[#16283a] text-[#7db8e8]'
                }`}
              >
                {u.role}
              </span>
              <span className="text-studio-faint">
                {u.last_sign_in_at
                  ? `last seen ${new Date(u.last_sign_in_at).toLocaleString()}`
                  : u.confirmed
                    ? 'never signed in'
                    : 'invite pending'}
              </span>
              {u.role === 'client' && (
                <button
                  onClick={() => remove(u)}
                  disabled={busy}
                  className="ml-auto text-studio-muted hover:text-red-400"
                >
                  remove
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
