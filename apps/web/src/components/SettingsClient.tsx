'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { BrandAssetKind } from '@vd/shared/types';
import {
  DEFAULT_RENDER_TEMPLATE,
  resolveRenderTemplate,
  type RenderTemplate,
} from '@vd/shared/renderTemplate';
import {
  DEFAULT_DIRECTION_FIELDS,
  presetsToText,
  resolveDirectionFields,
  textToPresets,
  type DirectionField,
} from '@/lib/scriptDirectionPresets';
import { RenderTemplatePreview } from './RenderTemplatePreview';

export interface BrandAssetRow {
  id: string;
  kind: BrandAssetKind;
  name: string;
  is_default: boolean;
  created_at: string;
  /** Presigned R2 URL for direct preview loading; null when signing was unavailable. */
  media_url: string | null;
  /** Presigned URL of the worker-extracted poster frame, for video references. */
  poster_url: string | null;
}

const KINDS: { kind: BrandAssetKind; label: string; hint: string }[] = [
  { kind: 'avatar_reference', label: 'Avatar reference', hint: 'Silent talking-pose video (mp4) or photo of the presenter — sent to InfiniteTalk.' },
  { kind: 'logo', label: 'Logo', hint: 'Transparent PNG overlaid on every video — position/size set in the layout template below.' },
  { kind: 'outro', label: 'Outro card', hint: '1080×1920 PNG or short MP4 shown for ~3s at the end.' },
  { kind: 'bgm', label: 'Background music', hint: 'MP3 looped under the voiceover at low volume.' },
];

interface Voice {
  voice_id: string;
  name: string;
  language: string;
  gender: string;
}

interface GhlAccount {
  id: string;
  platform: string;
  name?: string;
}

export function SettingsClient({
  brandAssets,
  settings,
  defaultScriptPrompt,
  defaultCaptionPrompt,
}: {
  brandAssets: BrandAssetRow[];
  settings: Record<string, unknown>;
  defaultScriptPrompt: string;
  defaultCaptionPrompt: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [voices, setVoices] = useState<Voice[] | null>(null);
  const [ghlAccounts, setGhlAccounts] = useState<GhlAccount[] | null>(null);
  const [voiceId, setVoiceId] = useState((settings.heygen_voice_id as string) ?? '');
  const savedPrompt = (settings.script_system_prompt as string) ?? '';
  const [scriptPrompt, setScriptPrompt] = useState(savedPrompt || defaultScriptPrompt);
  const [promptSaved, setPromptSaved] = useState(false);
  const [brandName, setBrandName] = useState((settings.brand_name as string) ?? '');
  const [brandSaved, setBrandSaved] = useState(false);
  const savedCaptionPrompt = (settings.caption_system_prompt as string) ?? '';
  const [captionPrompt, setCaptionPrompt] = useState(savedCaptionPrompt || defaultCaptionPrompt);
  const [captionSaved, setCaptionSaved] = useState(false);
  const [tpl, setTpl] = useState<RenderTemplate>(() => resolveRenderTemplate(settings.render_template));
  const [tplSaved, setTplSaved] = useState(false);
  const [directionText, setDirectionText] = useState<Record<DirectionField['key'], string>>(() => {
    const resolved = resolveDirectionFields(settings.script_direction_presets);
    return Object.fromEntries(resolved.map((f) => [f.key, presetsToText(f.presets)])) as Record<
      DirectionField['key'],
      string
    >;
  });
  const [directionSaved, setDirectionSaved] = useState(false);

  const previewAsset = (kind: BrandAssetKind) =>
    brandAssets.find((a) => a.kind === kind && a.is_default) ?? brandAssets.find((a) => a.kind === kind);
  const logoAsset = previewAsset('logo');
  const avatarAsset = previewAsset('avatar_reference');

  function patchTpl(patch: {
    logo?: Partial<RenderTemplate['logo']>;
    subtitles?: Partial<RenderTemplate['subtitles']>;
    avatarBubble?: Partial<Omit<RenderTemplate['avatarBubble'], 'crop'>> & {
      crop?: Partial<RenderTemplate['avatarBubble']['crop']>;
    };
  }) {
    setTplSaved(false);
    setTpl((t) => ({
      logo: { ...t.logo, ...patch.logo },
      subtitles: { ...t.subtitles, ...patch.subtitles },
      avatarBubble: {
        ...t.avatarBubble,
        ...patch.avatarBubble,
        crop: { ...t.avatarBubble.crop, ...patch.avatarBubble?.crop },
      },
    }));
  }

  async function upload(kind: BrandAssetKind, file: File, makeDefault: boolean) {
    setBusy(kind);
    setError(null);
    try {
      const presign = await fetch('/api/brand-assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, filename: file.name }),
      });
      if (!presign.ok) throw new Error(await presign.text());
      const { uploadUrl, key, contentType } = await presign.json();

      const put = await fetch(uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': contentType },
        body: file,
      });
      if (!put.ok) throw new Error(`Upload failed: ${put.status}`);

      const confirm = await fetch('/api/brand-assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, filename: file.name, confirm: true, key, name: file.name, is_default: makeDefault }),
      });
      if (!confirm.ok) throw new Error(await confirm.text());
      router.refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(null);
    }
  }

  async function removeAsset(id: string) {
    await fetch('/api/brand-assets', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    router.refresh();
  }

  async function loadVoices() {
    setBusy('voices');
    const res = await fetch('/api/settings?voices=1');
    setBusy(null);
    if (!res.ok) return setError(await res.text());
    setVoices(await res.json());
  }

  async function loadGhl() {
    setBusy('ghl');
    const res = await fetch('/api/settings?ghl=1');
    setBusy(null);
    if (!res.ok) return setError(await res.text());
    setGhlAccounts(await res.json());
  }

  async function saveSetting(key: string, value: unknown) {
    setBusy(key);
    const res = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [key]: value }),
    });
    setBusy(null);
    if (!res.ok) {
      setError(await res.text());
      return false;
    }
    router.refresh();
    return true;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-xl font-semibold">Settings</h1>
      {error && <p className="rounded bg-red-950 p-2 text-sm text-red-300">{error}</p>}

      <section className="space-y-3 rounded-lg border border-neutral-800 bg-neutral-900 p-5">
        <h2 className="text-sm font-semibold text-neutral-300">Brand</h2>
        <p className="text-xs text-neutral-500">
          Shown in the dashboard header, the favicon, and on client review pages.
        </p>
        <div className="flex items-center gap-2">
          <input
            value={brandName}
            onChange={(e) => {
              setBrandName(e.target.value);
              setBrandSaved(false);
            }}
            placeholder="Brand Name"
            className="w-64 rounded border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-sm"
          />
          <button
            onClick={async () => {
              const ok = await saveSetting('brand_name', brandName.trim());
              if (ok) setBrandSaved(true);
            }}
            disabled={!!busy}
            className="rounded bg-yellow-400 px-3 py-1.5 text-sm font-semibold text-black disabled:opacity-50"
          >
            {busy === 'brand_name' ? 'Saving…' : 'Save'}
          </button>
          {brandSaved && <span className="text-xs text-emerald-400">Saved ✓</span>}
        </div>
      </section>

      <section className="space-y-4 rounded-lg border border-neutral-800 bg-neutral-900 p-5">
        <h2 className="text-sm font-semibold text-neutral-300">Brand assets</h2>
        {KINDS.map(({ kind, label, hint }) => {
          const items = brandAssets.filter((a) => a.kind === kind);
          return (
            <div key={kind} className="rounded border border-neutral-800 p-3">
              <div className="mb-1 flex items-center justify-between">
                <p className="text-sm font-medium">{label}</p>
                <label className="cursor-pointer rounded border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-800">
                  {busy === kind ? 'Uploading…' : 'Upload'}
                  <input
                    type="file"
                    className="hidden"
                    disabled={!!busy}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) upload(kind, f, true);
                      e.target.value = '';
                    }}
                  />
                </label>
              </div>
              <p className="mb-2 text-xs text-neutral-500">{hint}</p>
              {items.length === 0 && <p className="text-xs text-orange-400">None uploaded yet — required before generation.</p>}
              <ul className="space-y-1">
                {items.map((a) => (
                  <li key={a.id} className="flex items-center gap-2 text-xs">
                    <span>{a.name}</span>
                    {a.is_default && <span className="rounded bg-emerald-900 px-1.5 text-emerald-200">default</span>}
                    <button onClick={() => removeAsset(a.id)} className="ml-auto text-neutral-500 hover:text-red-400">
                      delete
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </section>

      <section className="space-y-4 rounded-lg border border-neutral-800 bg-neutral-900 p-5">
        <h2 className="text-sm font-semibold text-neutral-300">Video layout template</h2>
        <p className="text-xs text-neutral-500">
          Controls how every video is composited: logo placement, subtitle position, and the
          circular presenter bubble shown while B-roll scenes play. All sizes are in pixels on the
          1080×1920 frame. Applies to new renders — use Re-render on a video to apply changes.
        </p>

        <div className="flex flex-col-reverse gap-4 md:flex-row">
        <div className="min-w-0 flex-1 space-y-4">

        <div className="rounded border border-neutral-800 p-3">
          <p className="mb-1 text-sm font-medium">Render engine</p>
          <p className="mb-2 text-xs text-neutral-500">
            HyperFrames (HeyGen&apos;s HTML-based renderer) is the default and falls back to the
            ffmpeg engine automatically if a render fails. Both read the layout template below.
          </p>
          <select
            value={(settings.render_engine as string) === 'ffmpeg' ? 'ffmpeg' : 'hyperframes'}
            onChange={(e) => saveSetting('render_engine', e.target.value)}
            disabled={!!busy}
            className="rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm text-neutral-200"
          >
            <option value="hyperframes">HyperFrames (default)</option>
            <option value="ffmpeg">ffmpeg only</option>
          </select>
        </div>

        <div className="rounded border border-neutral-800 p-3">
          <p className="mb-2 text-sm font-medium">Logo</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <label className="text-xs text-neutral-400">
              Position
              <select
                value={tpl.logo.position}
                onChange={(e) => patchTpl({ logo: { position: e.target.value as RenderTemplate['logo']['position'] } })}
                className="mt-1 w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm text-neutral-200"
              >
                <option value="top_left">Top left</option>
                <option value="top_center">Top center</option>
                <option value="top_right">Top right</option>
                <option value="bottom_left">Bottom left</option>
                <option value="bottom_right">Bottom right</option>
              </select>
            </label>
            <label className="text-xs text-neutral-400">
              Width (px)
              <input
                type="number"
                value={tpl.logo.widthPx}
                onChange={(e) => patchTpl({ logo: { widthPx: Number(e.target.value) } })}
                className="mt-1 w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm text-neutral-200"
              />
            </label>
            <label className="text-xs text-neutral-400">
              Edge margin (px)
              <input
                type="number"
                value={tpl.logo.marginPx}
                onChange={(e) => patchTpl({ logo: { marginPx: Number(e.target.value) } })}
                className="mt-1 w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm text-neutral-200"
              />
            </label>
          </div>
        </div>

        <div className="rounded border border-neutral-800 p-3">
          <p className="mb-2 text-sm font-medium">Subtitles</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <label className="text-xs text-neutral-400">
              Font size (px)
              <input
                type="number"
                value={tpl.subtitles.fontSizePx}
                onChange={(e) => patchTpl({ subtitles: { fontSizePx: Number(e.target.value) } })}
                className="mt-1 w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm text-neutral-200"
              />
            </label>
            <label className="text-xs text-neutral-400">
              Height above bottom (px)
              <input
                type="number"
                value={tpl.subtitles.marginVPx}
                onChange={(e) => patchTpl({ subtitles: { marginVPx: Number(e.target.value) } })}
                className="mt-1 w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm text-neutral-200"
              />
            </label>
            <label className="flex items-end gap-2 pb-1.5 text-xs text-neutral-400">
              <input
                type="checkbox"
                checked={tpl.subtitles.uppercase}
                onChange={(e) => patchTpl({ subtitles: { uppercase: e.target.checked } })}
              />
              UPPERCASE
            </label>
          </div>
          <p className="mt-2 text-xs text-neutral-600">
            Higher &quot;height above bottom&quot; moves subtitles toward the middle of the frame
            (560 ≈ lower third, keeps clear of the platform UI overlays).
          </p>
        </div>

        <div className="rounded border border-neutral-800 p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium">Presenter bubble during B-roll</p>
            <label className="flex items-center gap-2 text-xs text-neutral-400">
              <input
                type="checkbox"
                checked={tpl.avatarBubble.enabled}
                onChange={(e) => patchTpl({ avatarBubble: { enabled: e.target.checked } })}
              />
              enabled
            </label>
          </div>
          <p className="mb-2 text-xs text-neutral-500">
            While a scene clip plays full-screen, the presenter&apos;s head stays visible in a
            circle. The crop controls pick which part of the avatar video fills the circle.
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <label className="text-xs text-neutral-400">
              Position
              <select
                value={tpl.avatarBubble.position}
                onChange={(e) => patchTpl({ avatarBubble: { position: e.target.value as RenderTemplate['avatarBubble']['position'] } })}
                className="mt-1 w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm text-neutral-200"
              >
                <option value="bottom_left">Bottom left</option>
                <option value="bottom_right">Bottom right</option>
              </select>
            </label>
            <label className="text-xs text-neutral-400">
              Circle size (px)
              <input
                type="number"
                value={tpl.avatarBubble.diameterPx}
                onChange={(e) => patchTpl({ avatarBubble: { diameterPx: Number(e.target.value) } })}
                className="mt-1 w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm text-neutral-200"
              />
            </label>
            <label className="text-xs text-neutral-400">
              Edge margin (px)
              <input
                type="number"
                value={tpl.avatarBubble.marginPx}
                onChange={(e) => patchTpl({ avatarBubble: { marginPx: Number(e.target.value) } })}
                className="mt-1 w-full rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm text-neutral-200"
              />
            </label>
            <label className="text-xs text-neutral-400">
              Head zoom ({Math.round(tpl.avatarBubble.crop.widthFrac * 100)}% of frame)
              <input
                type="range"
                min={20}
                max={100}
                value={Math.round(tpl.avatarBubble.crop.widthFrac * 100)}
                onChange={(e) => patchTpl({ avatarBubble: { crop: { widthFrac: Number(e.target.value) / 100 } } })}
                className="mt-2 w-full"
              />
            </label>
            <label className="text-xs text-neutral-400">
              Head horizontal ({Math.round(tpl.avatarBubble.crop.centerXFrac * 100)}%)
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(tpl.avatarBubble.crop.centerXFrac * 100)}
                onChange={(e) => patchTpl({ avatarBubble: { crop: { centerXFrac: Number(e.target.value) / 100 } } })}
                className="mt-2 w-full"
              />
            </label>
            <label className="text-xs text-neutral-400">
              Head top offset ({Math.round(tpl.avatarBubble.crop.topFrac * 100)}%)
              <input
                type="range"
                min={0}
                max={80}
                value={Math.round(tpl.avatarBubble.crop.topFrac * 100)}
                onChange={(e) => patchTpl({ avatarBubble: { crop: { topFrac: Number(e.target.value) / 100 } } })}
                className="mt-2 w-full"
              />
            </label>
          </div>
          <p className="mt-2 text-xs text-neutral-600">
            Smaller zoom = tighter on the head. Lower top offset = higher in the frame.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={async () => {
              const ok = await saveSetting('render_template', resolveRenderTemplate(tpl));
              if (ok) setTplSaved(true);
            }}
            disabled={!!busy}
            className="rounded bg-yellow-400 px-3 py-1.5 text-sm font-semibold text-black disabled:opacity-50"
          >
            {busy === 'render_template' ? 'Saving…' : 'Save layout'}
          </button>
          <button
            onClick={() => {
              setTpl(DEFAULT_RENDER_TEMPLATE);
              setTplSaved(false);
            }}
            disabled={!!busy}
            className="rounded border border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-800 disabled:opacity-50"
          >
            Reset to default
          </button>
          {tplSaved && <span className="text-xs text-emerald-400">Saved ✓</span>}
        </div>

        </div>
        <div className="shrink-0 md:w-[248px]">
          <div className="md:sticky md:top-4">
            <RenderTemplatePreview
              tpl={resolveRenderTemplate(tpl)}
              logoSrc={logoAsset ? logoAsset.media_url ?? `/api/brand-assets/${logoAsset.id}/media` : null}
              avatarSrc={avatarAsset ? avatarAsset.media_url ?? `/api/brand-assets/${avatarAsset.id}/media` : null}
              avatarPosterSrc={avatarAsset?.poster_url ?? null}
              avatarIsVideo={/\.(mp4|mov|webm)$/i.test(avatarAsset?.name ?? '')}
            />
          </div>
        </div>
        </div>
      </section>

      <section className="space-y-3 rounded-lg border border-neutral-800 bg-neutral-900 p-5">
        <h2 className="text-sm font-semibold text-neutral-300">Claude script generator</h2>
        <p className="text-xs text-neutral-500">
          System prompt used every time Claude writes or regenerates a script. Claude also
          remembers your previously generated scripts automatically, so new requests get fresh
          hooks and angles instead of repeats.
        </p>
        <textarea
          value={scriptPrompt}
          onChange={(e) => {
            setScriptPrompt(e.target.value);
            setPromptSaved(false);
          }}
          rows={14}
          spellCheck={false}
          className="w-full rounded border border-neutral-700 bg-neutral-950 p-3 font-mono text-xs leading-relaxed text-neutral-200"
        />
        <div className="flex items-center gap-2">
          <button
            onClick={async () => {
              const ok = await saveSetting('script_system_prompt', scriptPrompt.trim());
              if (ok) setPromptSaved(true);
            }}
            disabled={!!busy}
            className="rounded bg-yellow-400 px-3 py-1.5 text-sm font-semibold text-black disabled:opacity-50"
          >
            {busy === 'script_system_prompt' ? 'Saving…' : 'Save prompt'}
          </button>
          <button
            onClick={() => {
              setScriptPrompt(defaultScriptPrompt);
              setPromptSaved(false);
            }}
            disabled={!!busy}
            className="rounded border border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-800 disabled:opacity-50"
          >
            Reset to default
          </button>
          {promptSaved && <span className="text-xs text-emerald-400">Saved ✓</span>}
          {savedPrompt && savedPrompt !== defaultScriptPrompt && (
            <span className="ml-auto text-xs text-neutral-500">custom prompt active</span>
          )}
        </div>
      </section>

      <section className="space-y-4 rounded-lg border border-neutral-800 bg-neutral-900 p-5">
        <h2 className="text-sm font-semibold text-neutral-300">AI Script Generator presets</h2>
        <p className="text-xs text-neutral-500">
          The dropdown options operators pick from on the New Video page when batch-generating
          scripts. One preset per line as <code>Label | prompt text sent to Claude</code>. Leave a
          field to use the built-in defaults. These only tailor the menu — the brand voice still
          comes from the script prompt above.
        </p>
        {DEFAULT_DIRECTION_FIELDS.map((f) => (
          <div key={f.key}>
            <label className="mb-1 block text-xs font-medium text-neutral-400">{f.label}</label>
            <textarea
              value={directionText[f.key]}
              onChange={(e) => {
                setDirectionText((prev) => ({ ...prev, [f.key]: e.target.value }));
                setDirectionSaved(false);
              }}
              rows={5}
              spellCheck={false}
              className="w-full rounded border border-neutral-700 bg-neutral-950 p-3 font-mono text-xs leading-relaxed text-neutral-200"
            />
          </div>
        ))}
        <div className="flex items-center gap-2">
          <button
            onClick={async () => {
              const value = Object.fromEntries(
                DEFAULT_DIRECTION_FIELDS.map((f) => [f.key, textToPresets(directionText[f.key])]),
              );
              const ok = await saveSetting('script_direction_presets', value);
              if (ok) setDirectionSaved(true);
            }}
            disabled={!!busy}
            className="rounded bg-yellow-400 px-3 py-1.5 text-sm font-semibold text-black disabled:opacity-50"
          >
            {busy === 'script_direction_presets' ? 'Saving…' : 'Save presets'}
          </button>
          <button
            onClick={() => {
              setDirectionText(
                Object.fromEntries(
                  DEFAULT_DIRECTION_FIELDS.map((f) => [f.key, presetsToText(f.presets)]),
                ) as Record<DirectionField['key'], string>,
              );
              setDirectionSaved(false);
            }}
            disabled={!!busy}
            className="rounded border border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-800 disabled:opacity-50"
          >
            Reset to default
          </button>
          {directionSaved && <span className="text-xs text-emerald-400">Saved ✓</span>}
        </div>
      </section>

      <section className="space-y-3 rounded-lg border border-neutral-800 bg-neutral-900 p-5">
        <h2 className="text-sm font-semibold text-neutral-300">Claude caption writer</h2>
        <p className="text-xs text-neutral-500">
          System prompt used to write the post caption after the final video is approved.
          Put your brand, hashtags, and local tags here.
        </p>
        <textarea
          value={captionPrompt}
          onChange={(e) => {
            setCaptionPrompt(e.target.value);
            setCaptionSaved(false);
          }}
          rows={6}
          spellCheck={false}
          className="w-full rounded border border-neutral-700 bg-neutral-950 p-3 font-mono text-xs leading-relaxed text-neutral-200"
        />
        <div className="flex items-center gap-2">
          <button
            onClick={async () => {
              const ok = await saveSetting('caption_system_prompt', captionPrompt.trim());
              if (ok) setCaptionSaved(true);
            }}
            disabled={!!busy}
            className="rounded bg-yellow-400 px-3 py-1.5 text-sm font-semibold text-black disabled:opacity-50"
          >
            {busy === 'caption_system_prompt' ? 'Saving…' : 'Save prompt'}
          </button>
          <button
            onClick={() => {
              setCaptionPrompt(defaultCaptionPrompt);
              setCaptionSaved(false);
            }}
            disabled={!!busy}
            className="rounded border border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-800 disabled:opacity-50"
          >
            Reset to default
          </button>
          {captionSaved && <span className="text-xs text-emerald-400">Saved ✓</span>}
          {savedCaptionPrompt && savedCaptionPrompt !== defaultCaptionPrompt && (
            <span className="ml-auto text-xs text-neutral-500">custom prompt active</span>
          )}
        </div>
      </section>

      <section className="space-y-3 rounded-lg border border-neutral-800 bg-neutral-900 p-5">
        <h2 className="text-sm font-semibold text-neutral-300">HeyGen voice</h2>
        <p className="text-xs text-neutral-500">
          Current voice id: <code>{(settings.heygen_voice_id as string) || 'not set'}</code>
        </p>
        {!voices ? (
          <button
            onClick={loadVoices}
            disabled={!!busy}
            className="rounded border border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-800 disabled:opacity-50"
          >
            {busy === 'voices' ? 'Loading…' : 'Load English voices'}
          </button>
        ) : (
          <div className="flex gap-2">
            <select
              value={voiceId}
              onChange={(e) => setVoiceId(e.target.value)}
              className="flex-1 rounded border border-neutral-700 bg-neutral-800 px-2 py-1.5 text-sm"
            >
              <option value="">— pick a voice —</option>
              {voices.map((v) => (
                <option key={v.voice_id} value={v.voice_id}>
                  {v.name} ({v.gender}, {v.language})
                </option>
              ))}
            </select>
            <button
              onClick={() => saveSetting('heygen_voice_id', voiceId)}
              disabled={!voiceId || !!busy}
              className="rounded bg-yellow-400 px-3 py-1.5 text-sm font-semibold text-black disabled:opacity-50"
            >
              Save
            </button>
          </div>
        )}
      </section>

      <section className="space-y-3 rounded-lg border border-neutral-800 bg-neutral-900 p-5">
        <h2 className="text-sm font-semibold text-neutral-300">GoHighLevel / social posting</h2>
        <p className="text-xs text-neutral-500">
          Posts go to the accounts in GHL_SOCIAL_ACCOUNT_IDS (comma-separated — TikTok,
          Instagram, Facebook, ...) as user GHL_USER_ID. Use this to look the ids up.
        </p>
        <button
          onClick={loadGhl}
          disabled={!!busy}
          className="rounded border border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-800 disabled:opacity-50"
        >
          {busy === 'ghl' ? 'Loading…' : 'List connected social accounts'}
        </button>
        {ghlAccounts && (
          <ul className="space-y-1 text-xs">
            {ghlAccounts.map((a) => (
              <li key={a.id} className="rounded bg-neutral-950 p-2">
                <b>{a.platform}</b> {a.name} — id: <code>{a.id}</code>
              </li>
            ))}
            {ghlAccounts.length === 0 && (
              <li className="text-orange-400">
                No social accounts connected in this GHL location yet.
              </li>
            )}
          </ul>
        )}
      </section>
    </div>
  );
}
