'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import type { DirectionField } from '@/lib/scriptDirectionPresets';

const CUSTOM = '__custom__';

type ItemState = 'pending' | 'generating' | 'done' | 'error' | 'cancelled';

interface Item {
  state: ItemState;
  id?: string;
  videoNo?: number;
  title?: string;
  error?: string;
}

type FieldKey = DirectionField['key'];

export default function AiScriptGenerator({ fields }: { fields: DirectionField[] }) {
  const [qty, setQty] = useState(3);
  const [selected, setSelected] = useState<Record<FieldKey, string>>({
    tone: '',
    style: '',
    constraints: '',
    flow: '',
  });
  const [custom, setCustom] = useState<Record<FieldKey, string>>({
    tone: '',
    style: '',
    constraints: '',
    flow: '',
  });
  const [items, setItems] = useState<Item[]>([]);
  const [running, setRunning] = useState(false);
  const cancelRef = useRef(false);

  function resolvedDirection(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const f of fields) {
      const sel = selected[f.key];
      const value = sel === CUSTOM ? custom[f.key].trim() : sel;
      if (value) out[f.key] = value;
    }
    return out;
  }

  function setItem(i: number, patch: Partial<Item>) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }

  async function generate() {
    cancelRef.current = false;
    setRunning(true);
    setItems(Array.from({ length: qty }, () => ({ state: 'pending' as ItemState })));
    const direction = resolvedDirection();

    for (let i = 0; i < qty; i++) {
      if (cancelRef.current) {
        setItems((prev) =>
          prev.map((it) => (it.state === 'pending' ? { ...it, state: 'cancelled' } : it)),
        );
        break;
      }
      setItem(i, { state: 'generating' });
      try {
        const res = await fetch('/api/videos/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(direction),
        });
        if (!res.ok) throw new Error(await res.text());
        const { id, video_no, title } = (await res.json()) as {
          id: string;
          video_no: number;
          title: string;
        };
        setItem(i, { state: 'done', id, videoNo: video_no, title });
      } catch (e) {
        setItem(i, { state: 'error', error: e instanceof Error ? e.message : String(e) });
      }
    }
    setRunning(false);
  }

  const doneCount = items.filter((it) => it.state === 'done').length;
  const finished = items.length > 0 && !running;

  return (
    <div className="space-y-4 rounded-[16px] border border-studio bg-studio-panel p-6">
      <div>
        <h2 className="text-[15px] font-semibold text-studio-accent">AI Script Generator</h2>
        <p className="mt-1 text-sm text-studio-sub">
          Claude studies your brand settings and every title already produced, then invents fresh
          topics and writes the scripts. Each one lands in Script Review for the client.
        </p>
      </div>

      <div>
        <label className="mb-1 block text-sm text-studio-sub">How many scripts?</label>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={running || qty <= 1}
            onClick={() => setQty((q) => Math.max(1, q - 1))}
            className="h-8 w-8 rounded-[9px] border border-studio-border-strong text-lg leading-none hover:bg-studio-inset disabled:opacity-50"
          >
            –
          </button>
          <span className="w-8 text-center text-sm font-semibold">{qty}</span>
          <button
            type="button"
            disabled={running || qty >= 10}
            onClick={() => setQty((q) => Math.min(10, q + 1))}
            className="h-8 w-8 rounded-[9px] border border-studio-border-strong text-lg leading-none hover:bg-studio-inset disabled:opacity-50"
          >
            +
          </button>
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm text-studio-sub">
          Creative direction — leave on Default to use your brand settings.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {fields.map((f) => (
            <div key={f.key}>
              <label className="mb-1 block text-xs text-studio-muted">{f.label}</label>
              <select
                value={selected[f.key]}
                disabled={running}
                onChange={(e) => setSelected((prev) => ({ ...prev, [f.key]: e.target.value }))}
                className="w-full rounded-[8px] border border-studio-border-strong bg-studio-inset px-3 py-2 text-sm disabled:opacity-50"
              >
                <option value="">Default</option>
                {f.presets.map((p) => (
                  <option key={p.label} value={p.prompt}>
                    {p.label}
                  </option>
                ))}
                <option value={CUSTOM}>Custom…</option>
              </select>
              {selected[f.key] === CUSTOM && (
                <input
                  value={custom[f.key]}
                  disabled={running}
                  onChange={(e) => setCustom((prev) => ({ ...prev, [f.key]: e.target.value }))}
                  placeholder={f.hint}
                  className="mt-2 w-full rounded-[8px] border border-studio-border-strong bg-studio-inset px-3 py-2 text-sm disabled:opacity-50"
                />
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          disabled={running}
          onClick={generate}
          className="studio-lift rounded-[9px] bg-studio-accent px-4 py-2 text-sm font-semibold text-studio-on-accent disabled:opacity-50"
        >
          {running ? `Generating ${Math.min(doneCount + 1, qty)}/${qty}…` : `Generate ${qty} script${qty > 1 ? 's' : ''}`}
        </button>
        {running && (
          <button
            onClick={() => {
              cancelRef.current = true;
            }}
            className="rounded-[9px] border border-studio-border-strong px-4 py-2 text-sm text-studio-sub hover:bg-studio-inset"
          >
            Stop after current
          </button>
        )}
        <span className="ml-auto font-mono text-xs text-studio-muted">≈ $0.02 / script</span>
      </div>

      {items.length > 0 && (
        <ul className="space-y-1 border-t border-studio pt-3">
          {items.map((it, i) => (
            <li key={i} className="flex items-center gap-2 text-sm">
              {it.state === 'pending' && <span className="text-studio-faint">Waiting…</span>}
              {it.state === 'generating' && (
                <span className="text-studio-sub">
                  <span className="mr-2 inline-block animate-pulse">✦</span>Writing script…
                </span>
              )}
              {it.state === 'done' && (
                <>
                  <span className="text-studio-accent">✦</span>
                  <Link
                    href={`/videos/${it.id}/script`}
                    className="text-studio-accent hover:underline"
                  >
                    V{it.videoNo} {it.title}
                  </Link>
                </>
              )}
              {it.state === 'error' && (
                <span className="text-red-400">Failed: {it.error}</span>
              )}
              {it.state === 'cancelled' && <span className="text-studio-faint">Cancelled</span>}
            </li>
          ))}
        </ul>
      )}
      {finished && doneCount > 0 && (
        <p className="text-sm text-studio-sub">
          Done — {doneCount} script{doneCount > 1 ? 's' : ''} sent to Script Review.{' '}
          <Link href="/" className="text-studio-accent hover:underline">
            View them on the board
          </Link>
        </p>
      )}
    </div>
  );
}
