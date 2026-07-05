'use client';

import { createBrowserClient } from '@supabase/ssr';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

type Mode = 'password' | 'otp';

function supabaseBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setCode('');
    setCodeSent(false);
  }

  async function submitPassword(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabaseBrowser().auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push('/');
    router.refresh();
  }

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    // shouldCreateUser: false keeps login invite-only — unknown emails get no account.
    const { error } = await supabaseBrowser().auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false },
    });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setCodeSent(true);
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabaseBrowser().auth.verifyOtp({
      email,
      token: code.trim(),
      type: 'email',
    });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push('/');
    router.refresh();
  }

  const inputClass =
    'w-full rounded-[8px] border border-studio-border-strong bg-studio-inset px-3 py-2 text-sm';
  const buttonClass =
    'studio-lift w-full rounded-[9px] bg-studio-accent px-3 py-2 text-sm font-semibold text-studio-on-accent disabled:opacity-50';

  return (
    <div className="mx-auto mt-24 max-w-sm rounded-[14px] border border-studio-border bg-studio-card p-6">
      <h1 className="mb-4 text-lg font-semibold text-studio-bright">Sign in</h1>
      <div className="mb-4 grid grid-cols-2 gap-1 rounded-[9px] border border-studio-border bg-studio-inset p-1 text-sm">
        {(
          [
            ['password', 'Team login'],
            ['otp', 'Email code'],
          ] as [Mode, string][]
        ).map(([m, label]) => (
          <button
            key={m}
            type="button"
            onClick={() => switchMode(m)}
            className={`rounded-[7px] px-2 py-1.5 font-medium ${
              mode === m ? 'bg-studio-card text-studio-bright' : 'text-studio-muted'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {mode === 'password' && (
        <form onSubmit={submitPassword} className="space-y-3">
          <input
            type="email"
            required
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
          <input
            type="password"
            required
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
          />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button disabled={busy} className={buttonClass}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      )}

      {mode === 'otp' && !codeSent && (
        <form onSubmit={sendCode} className="space-y-3">
          <input
            type="email"
            required
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button disabled={busy} className={buttonClass}>
            {busy ? 'Sending…' : 'Email me a sign-in code'}
          </button>
          <p className="text-xs text-studio-muted">
            For invited reviewers — no password needed. We&apos;ll email you a 6-digit code.
          </p>
        </form>
      )}

      {mode === 'otp' && codeSent && (
        <form onSubmit={verifyCode} className="space-y-3">
          <p className="text-sm text-studio-muted">
            Code sent to <span className="text-studio-bright">{email}</span>. Enter it below.
          </p>
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            placeholder="6-digit code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className={inputClass}
          />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button disabled={busy} className={buttonClass}>
            {busy ? 'Verifying…' : 'Verify and sign in'}
          </button>
          <button
            type="button"
            onClick={() => setCodeSent(false)}
            className="w-full text-xs text-studio-muted underline-offset-2 hover:underline"
          >
            Use a different email or resend
          </button>
        </form>
      )}
    </div>
  );
}
