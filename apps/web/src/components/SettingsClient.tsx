'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  SPOKEN_WORDS_PER_SECOND,
  resolveBgmVolume,
  resolveTargetDurationS,
  resolveTargetIncludesOutro,
  wordBudgetForDuration,
  type BrandAssetKind,
} from '@vd/shared/types';
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

/** Left sub-nav sections — one entry per top-level section rendered below. */
const NAV: { id: string; label: string }[] = [
  { id: 'brand', label: 'Brand' },
  { id: 'assets', label: 'Brand assets' },
  { id: 'layout', label: 'Video layout template' },
  { id: 'prompt', label: 'Script prompt' },
  { id: 'presets', label: 'Generator presets' },
  { id: 'caption', label: 'Caption prompt' },
  { id: 'voice', label: 'HeyGen voice' },
  { id: 'social', label: 'Social posting' },
  { id: 'api', label: 'API keys' },
];

export function SettingsClient({
  brandAssets,
  settings,
  defaultScriptPrompt,
  defaultCaptionPrompt,
  children,
}: {
  brandAssets: BrandAssetRow[];
  settings: Record<string, unknown>;
  defaultScriptPrompt: string;
  defaultCaptionPrompt: string;
  /** API keys section, rendered inside the switcher as the last nav item. */
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const [section, setSection] = useState('brand');
  /** Pure show/hide — every section stays mounted so in-progress edits never reset. */
  const show = (id: string) => (section === id ? '' : 'hidden');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [voices, setVoices] = useState<Voice[] | null>(null);
  const [ghlAccounts, setGhlAccounts] = useState<GhlAccount[] | null>(null);
  const [voiceId, setVoiceId] = useState((settings.heygen_voice_id as string) ?? '');
  const savedPrompt = (settings.script_system_prompt as string) ?? '';
  const [scriptPrompt, setScriptPrompt] = useState(savedPrompt || defaultScriptPrompt);
  const [promptSaved, setPromptSaved] = useState(false);
  const [targetDur, setTargetDur] = useState(
    String(resolveTargetDurationS(settings.target_duration_s)),
  );
  const [targetIncludesOutro, setTargetIncludesOutro] = useState(
    resolveTargetIncludesOutro(settings.target_duration_includes_outro),
  );
  const [targetDurSaved, setTargetDurSaved] = useState(false);
  const [brandName, setBrandName] = useState((settings.brand_name as string) ?? '');
  const [brandSaved, setBrandSaved] = useState(false);
  const savedCaptionPrompt = (settings.caption_system_prompt as string) ?? '';
  const [captionPrompt, setCaptionPrompt] = useState(savedCaptionPrompt || defaultCaptionPrompt);
  const [captionSaved, setCaptionSaved] = useState(false);
  const [tpl, setTpl] = useState<RenderTemplate>(() => resolveRenderTemplate(settings.render_template));
  const [tplSaved, setTplSaved] = useState(false);
  const [bgmVolume, setBgmVolume] = useState(() => resolveBgmVolume(settings.bgm_volume));
  const [bgmVolumeSaved, setBgmVolumeSaved] = useState(false);
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
    <div className="mx-auto max-w-[1120px]">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight text-studio-bright">Settings</h1>
      {error && <p className="mb-5 rounded-[8px] bg-red-950 p-2 text-sm text-red-300">{error}</p>}

      <div className="flex flex-col gap-7 md:flex-row md:items-start">
        <nav className="shrink-0 md:sticky md:top-[76px] md:w-[210px]">
          <div className="studio-eyebrow mb-2.5 px-2">White-label</div>
          <div className="flex flex-wrap gap-1 md:flex-col">
            {NAV.map((n) => (
              <button
                key={n.id}
                onClick={() => setSection(n.id)}
                className={`rounded-[8px] px-3 py-2 text-left text-sm transition-colors ${
                  section === n.id
                    ? 'bg-studio-accent font-semibold text-studio-on-accent'
                    : 'text-studio-sub hover:text-studio-bright'
                }`}
              >
                {n.label}
              </button>
            ))}
          </div>
        </nav>

        <div className="min-w-0 flex-1">

      <section className={`space-y-3 rounded-[14px] border border-studio-border bg-studio-panel p-6 ${show('brand')}`}>
        <h2 className="text-lg font-semibold text-studio-bright">Brand</h2>
        <p className="text-xs text-studio-muted">
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
            className="w-64 rounded-[8px] border border-studio-border-strong bg-studio-inset px-3 py-1.5 text-sm"
          />
          <button
            onClick={async () => {
              const ok = await saveSetting('brand_name', brandName.trim());
              if (ok) setBrandSaved(true);
            }}
            disabled={!!busy}
            className="studio-lift rounded-[9px] bg-studio-accent px-3 py-1.5 text-sm font-semibold text-studio-on-accent disabled:opacity-50"
          >
            {busy === 'brand_name' ? 'Saving…' : 'Save'}
          </button>
          {brandSaved && <span className="text-xs text-emerald-400">Saved ✓</span>}
        </div>
      </section>

      <section className={`space-y-4 rounded-[14px] border border-studio-border bg-studio-panel p-6 ${show('assets')}`}>
        <h2 className="text-lg font-semibold text-studio-bright">Brand assets</h2>
        {KINDS.map(({ kind, label, hint }) => {
          const items = brandAssets.filter((a) => a.kind === kind);
          return (
            <div key={kind} className="rounded-[10px] border border-studio-border bg-studio-card p-3">
              <div className="mb-1 flex items-center justify-between">
                <p className="text-sm font-medium">{label}</p>
                <label className="cursor-pointer rounded-[6px] border border-studio-border-strong px-2 py-1 text-xs text-studio-sub hover:bg-studio-inset">
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
              <p className="mb-2 text-xs text-studio-muted">{hint}</p>
              {items.length === 0 && <p className="text-xs text-orange-400">None uploaded yet — required before generation.</p>}
              <ul className="space-y-1">
                {items.map((a) => (
                  <li key={a.id} className="flex items-center gap-2 text-xs">
                    <span>{a.name}</span>
                    {a.is_default && <span className="rounded-[5px] bg-emerald-900 px-1.5 text-emerald-200">default</span>}
                    <button onClick={() => removeAsset(a.id)} className="ml-auto text-studio-muted hover:text-red-400">
                      delete
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </section>

      <section className={`space-y-4 rounded-[14px] border border-studio-border bg-studio-panel p-6 ${show('layout')}`}>
        <h2 className="text-lg font-semibold text-studio-bright">Video layout template</h2>
        <p className="text-xs text-studio-muted">
          Controls how every video is composited: logo placement, subtitle position, and the
          circular presenter bubble shown while B-roll scenes play. All sizes are in pixels on the
          1080×1920 frame. Applies to new renders — use Re-render on a video to apply changes.
        </p>

        <div className="flex flex-col-reverse gap-4 md:flex-row">
        <div className="min-w-0 flex-1 space-y-4">

        <div className="rounded-[10px] border border-studio-border bg-studio-card p-3">
          <p className="mb-1 text-sm font-medium">Render engine</p>
          <p className="mb-2 text-xs text-studio-muted">
            HyperFrames (HeyGen&apos;s HTML-based renderer) is the default and falls back to the
            ffmpeg engine automatically if a render fails. Both read the layout template below.
          </p>
          <select
            value={(settings.render_engine as string) === 'ffmpeg' ? 'ffmpeg' : 'hyperframes'}
            onChange={(e) => saveSetting('render_engine', e.target.value)}
            disabled={!!busy}
            className="rounded-[8px] border border-studio-border-strong bg-studio-inset px-2 py-1.5 text-sm text-studio-text"
          >
            <option value="hyperframes">HyperFrames (default)</option>
            <option value="ffmpeg">ffmpeg only</option>
          </select>
        </div>

        <div className="rounded-[10px] border border-studio-border bg-studio-card p-3">
          <p className="mb-1 text-sm font-medium">Background music volume</p>
          <p className="mb-2 text-xs text-studio-muted">
            How loud the looped BGM sits under the voiceover. Lower it if the music drowns out
            speech; 8% is the default ducked level. Applies to new renders — use Re-render to apply.
          </p>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={0.3}
              step={0.01}
              value={bgmVolume}
              onChange={(e) => {
                setBgmVolume(Number(e.target.value));
                setBgmVolumeSaved(false);
              }}
              className="flex-1 accent-studio-accent"
            />
            <span className="w-10 text-right text-sm tabular-nums text-studio-text">
              {Math.round(bgmVolume * 100)}%
            </span>
            <button
              onClick={async () => {
                const ok = await saveSetting('bgm_volume', bgmVolume);
                if (ok) setBgmVolumeSaved(true);
              }}
              disabled={!!busy}
              className="studio-lift rounded-[9px] bg-studio-accent px-3 py-1.5 text-sm font-semibold text-studio-on-accent disabled:opacity-50"
            >
              {busy === 'bgm_volume' ? 'Saving…' : 'Save volume'}
            </button>
            {bgmVolumeSaved && <span className="text-xs text-emerald-400">Saved ✓</span>}
          </div>
        </div>

        <div className="rounded-[10px] border border-studio-border bg-studio-card p-3">
          <p className="mb-2 text-sm font-medium">Logo</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <label className="text-xs text-studio-sub">
              Position
              <select
                value={tpl.logo.position}
                onChange={(e) => patchTpl({ logo: { position: e.target.value as RenderTemplate['logo']['position'] } })}
                className="mt-1 w-full rounded-[8px] border border-studio-border-strong bg-studio-inset px-2 py-1.5 text-sm text-studio-text"
              >
                <option value="top_left">Top left</option>
                <option value="top_center">Top center</option>
                <option value="top_right">Top right</option>
                <option value="bottom_left">Bottom left</option>
                <option value="bottom_right">Bottom right</option>
              </select>
            </label>
            <label className="text-xs text-studio-sub">
              Width (px)
              <input
                type="number"
                value={tpl.logo.widthPx}
                onChange={(e) => patchTpl({ logo: { widthPx: Number(e.target.value) } })}
                className="mt-1 w-full rounded-[8px] border border-studio-border-strong bg-studio-inset px-2 py-1.5 text-sm text-studio-text"
              />
            </label>
            <label className="text-xs text-studio-sub">
              Edge margin (px)
              <input
                type="number"
                value={tpl.logo.marginPx}
                onChange={(e) => patchTpl({ logo: { marginPx: Number(e.target.value) } })}
                className="mt-1 w-full rounded-[8px] border border-studio-border-strong bg-studio-inset px-2 py-1.5 text-sm text-studio-text"
              />
            </label>
          </div>
        </div>

        <div className="rounded-[10px] border border-studio-border bg-studio-card p-3">
          <p className="mb-2 text-sm font-medium">Subtitles</p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <label className="text-xs text-studio-sub">
              Font size (px)
              <input
                type="number"
                value={tpl.subtitles.fontSizePx}
                onChange={(e) => patchTpl({ subtitles: { fontSizePx: Number(e.target.value) } })}
                className="mt-1 w-full rounded-[8px] border border-studio-border-strong bg-studio-inset px-2 py-1.5 text-sm text-studio-text"
              />
            </label>
            <label className="text-xs text-studio-sub">
              Height above bottom (px)
              <input
                type="number"
                value={tpl.subtitles.marginVPx}
                onChange={(e) => patchTpl({ subtitles: { marginVPx: Number(e.target.value) } })}
                className="mt-1 w-full rounded-[8px] border border-studio-border-strong bg-studio-inset px-2 py-1.5 text-sm text-studio-text"
              />
            </label>
            <label className="flex items-end gap-2 pb-1.5 text-xs text-studio-sub">
              <input
                type="checkbox"
                checked={tpl.subtitles.uppercase}
                onChange={(e) => patchTpl({ subtitles: { uppercase: e.target.checked } })}
              />
              UPPERCASE
            </label>
          </div>
          <p className="mt-2 text-xs text-studio-faint">
            Higher &quot;height above bottom&quot; moves subtitles toward the middle of the frame
            (560 ≈ lower third, keeps clear of the platform UI overlays).
          </p>
        </div>

        <div className="rounded-[10px] border border-studio-border bg-studio-card p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium">Presenter bubble during B-roll</p>
            <label className="flex items-center gap-2 text-xs text-studio-sub">
              <input
                type="checkbox"
                checked={tpl.avatarBubble.enabled}
                onChange={(e) => patchTpl({ avatarBubble: { enabled: e.target.checked } })}
              />
              enabled
            </label>
          </div>
          <p className="mb-2 text-xs text-studio-muted">
            While a scene clip plays full-screen, the presenter&apos;s head stays visible in a
            circle. The crop controls pick which part of the avatar video fills the circle.
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <label className="text-xs text-studio-sub">
              Position
              <select
                value={tpl.avatarBubble.position}
                onChange={(e) => patchTpl({ avatarBubble: { position: e.target.value as RenderTemplate['avatarBubble']['position'] } })}
                className="mt-1 w-full rounded-[8px] border border-studio-border-strong bg-studio-inset px-2 py-1.5 text-sm text-studio-text"
              >
                <option value="bottom_left">Bottom left</option>
                <option value="bottom_right">Bottom right</option>
              </select>
            </label>
            <label className="text-xs text-studio-sub">
              Circle size (px)
              <input
                type="number"
                value={tpl.avatarBubble.diameterPx}
                onChange={(e) => patchTpl({ avatarBubble: { diameterPx: Number(e.target.value) } })}
                className="mt-1 w-full rounded-[8px] border border-studio-border-strong bg-studio-inset px-2 py-1.5 text-sm text-studio-text"
              />
            </label>
            <label className="text-xs text-studio-sub">
              Edge margin (px)
              <input
                type="number"
                value={tpl.avatarBubble.marginPx}
                onChange={(e) => patchTpl({ avatarBubble: { marginPx: Number(e.target.value) } })}
                className="mt-1 w-full rounded-[8px] border border-studio-border-strong bg-studio-inset px-2 py-1.5 text-sm text-studio-text"
              />
            </label>
            <label className="text-xs text-studio-sub">
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
            <label className="text-xs text-studio-sub">
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
            <label className="text-xs text-studio-sub">
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
          <p className="mt-2 text-xs text-studio-faint">
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
            className="studio-lift rounded-[9px] bg-studio-accent px-3 py-1.5 text-sm font-semibold text-studio-on-accent disabled:opacity-50"
          >
            {busy === 'render_template' ? 'Saving…' : 'Save layout'}
          </button>
          <button
            onClick={() => {
              setTpl(DEFAULT_RENDER_TEMPLATE);
              setTplSaved(false);
            }}
            disabled={!!busy}
            className="rounded-[9px] border border-studio-border-strong px-3 py-1.5 text-sm text-studio-sub hover:bg-studio-inset disabled:opacity-50"
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

      <section className={`space-y-3 rounded-[14px] border border-studio-border bg-studio-panel p-6 ${show('prompt')}`}>
        <h2 className="text-lg font-semibold text-studio-bright">Claude script generator</h2>
        <div className="space-y-2 rounded-[8px] border border-studio-border p-3">
          <label className="block text-sm font-medium text-studio-sub">
            Target video length (seconds)
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="number"
              min={6}
              max={60}
              value={targetDur}
              onChange={(e) => {
                setTargetDur(e.target.value);
                setTargetDurSaved(false);
              }}
              className="w-20 rounded-[8px] border border-studio-border-strong bg-studio-inset px-3 py-1.5 text-sm"
            />
            <label className="flex items-center gap-1.5 text-xs text-studio-sub">
              <input
                type="checkbox"
                checked={targetIncludesOutro}
                onChange={(e) => {
                  setTargetIncludesOutro(e.target.checked);
                  setTargetDurSaved(false);
                }}
              />
              Target includes the outro card (spoken part gets what remains)
            </label>
            <button
              onClick={async () => {
                const n = resolveTargetDurationS(targetDur);
                setTargetDur(String(n));
                const ok =
                  (await saveSetting('target_duration_s', n)) &&
                  (await saveSetting('target_duration_includes_outro', targetIncludesOutro));
                if (ok) setTargetDurSaved(true);
              }}
              disabled={!!busy}
              className="studio-lift rounded-[9px] bg-studio-accent px-3 py-1.5 text-sm font-semibold text-studio-on-accent disabled:opacity-50"
            >
              {busy === 'target_duration_s' || busy === 'target_duration_includes_outro'
                ? 'Saving…'
                : 'Save length'}
            </button>
            {targetDurSaved && <span className="text-xs text-emerald-400">Saved ✓</span>}
          </div>
          <p className="text-xs text-studio-muted">
            Enforced as a hard word budget when Claude writes scripts (~
            {SPOKEN_WORDS_PER_SECOND} words/sec, so {resolveTargetDurationS(targetDur)}s ≈{' '}
            {wordBudgetForDuration(resolveTargetDurationS(targetDur))} spoken words).{' '}
            {targetIncludesOutro
              ? 'The outro card (~3-5s) is counted inside the target, leaving less time for speech.'
              : 'The outro card adds ~3-5s on top of this target.'}
          </p>
        </div>
        <p className="text-xs text-studio-muted">
          System prompt used every time Claude writes or regenerates a script. Claude also
          remembers your previously generated scripts automatically, so new requests get fresh
          hooks and angles instead of repeats. The target length above is appended to this prompt
          as an authoritative duration contract — any word counts written in the prompt itself are
          overridden.
        </p>
        <textarea
          value={scriptPrompt}
          onChange={(e) => {
            setScriptPrompt(e.target.value);
            setPromptSaved(false);
          }}
          rows={14}
          spellCheck={false}
          className="w-full rounded-[8px] border border-studio-border-strong bg-studio-code p-3 font-mono text-xs leading-relaxed text-studio-text"
        />
        <div className="flex items-center gap-2">
          <button
            onClick={async () => {
              const ok = await saveSetting('script_system_prompt', scriptPrompt.trim());
              if (ok) setPromptSaved(true);
            }}
            disabled={!!busy}
            className="studio-lift rounded-[9px] bg-studio-accent px-3 py-1.5 text-sm font-semibold text-studio-on-accent disabled:opacity-50"
          >
            {busy === 'script_system_prompt' ? 'Saving…' : 'Save prompt'}
          </button>
          <button
            onClick={() => {
              setScriptPrompt(defaultScriptPrompt);
              setPromptSaved(false);
            }}
            disabled={!!busy}
            className="rounded-[9px] border border-studio-border-strong px-3 py-1.5 text-sm text-studio-sub hover:bg-studio-inset disabled:opacity-50"
          >
            Reset to default
          </button>
          {promptSaved && <span className="text-xs text-emerald-400">Saved ✓</span>}
          {savedPrompt && savedPrompt !== defaultScriptPrompt && (
            <span className="ml-auto text-xs text-studio-muted">custom prompt active</span>
          )}
        </div>
      </section>

      <section className={`space-y-4 rounded-[14px] border border-studio-border bg-studio-panel p-6 ${show('presets')}`}>
        <h2 className="text-lg font-semibold text-studio-bright">AI Script Generator presets</h2>
        <p className="text-xs text-studio-muted">
          The dropdown options operators pick from on the New Video page when batch-generating
          scripts. One preset per line as <code>Label | prompt text sent to Claude</code>. Leave a
          field to use the built-in defaults. These only tailor the menu — the brand voice still
          comes from the script prompt above.
        </p>
        {DEFAULT_DIRECTION_FIELDS.map((f) => (
          <div key={f.key}>
            <label className="mb-1 block text-xs font-medium text-studio-sub">{f.label}</label>
            <textarea
              value={directionText[f.key]}
              onChange={(e) => {
                setDirectionText((prev) => ({ ...prev, [f.key]: e.target.value }));
                setDirectionSaved(false);
              }}
              rows={5}
              spellCheck={false}
              className="w-full rounded-[8px] border border-studio-border-strong bg-studio-code p-3 font-mono text-xs leading-relaxed text-studio-text"
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
            className="studio-lift rounded-[9px] bg-studio-accent px-3 py-1.5 text-sm font-semibold text-studio-on-accent disabled:opacity-50"
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
            className="rounded-[9px] border border-studio-border-strong px-3 py-1.5 text-sm text-studio-sub hover:bg-studio-inset disabled:opacity-50"
          >
            Reset to default
          </button>
          {directionSaved && <span className="text-xs text-emerald-400">Saved ✓</span>}
        </div>
      </section>

      <section className={`space-y-3 rounded-[14px] border border-studio-border bg-studio-panel p-6 ${show('caption')}`}>
        <h2 className="text-lg font-semibold text-studio-bright">Claude caption writer</h2>
        <p className="text-xs text-studio-muted">
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
          className="w-full rounded-[8px] border border-studio-border-strong bg-studio-code p-3 font-mono text-xs leading-relaxed text-studio-text"
        />
        <div className="flex items-center gap-2">
          <button
            onClick={async () => {
              const ok = await saveSetting('caption_system_prompt', captionPrompt.trim());
              if (ok) setCaptionSaved(true);
            }}
            disabled={!!busy}
            className="studio-lift rounded-[9px] bg-studio-accent px-3 py-1.5 text-sm font-semibold text-studio-on-accent disabled:opacity-50"
          >
            {busy === 'caption_system_prompt' ? 'Saving…' : 'Save prompt'}
          </button>
          <button
            onClick={() => {
              setCaptionPrompt(defaultCaptionPrompt);
              setCaptionSaved(false);
            }}
            disabled={!!busy}
            className="rounded-[9px] border border-studio-border-strong px-3 py-1.5 text-sm text-studio-sub hover:bg-studio-inset disabled:opacity-50"
          >
            Reset to default
          </button>
          {captionSaved && <span className="text-xs text-emerald-400">Saved ✓</span>}
          {savedCaptionPrompt && savedCaptionPrompt !== defaultCaptionPrompt && (
            <span className="ml-auto text-xs text-studio-muted">custom prompt active</span>
          )}
        </div>
      </section>

      <section className={`space-y-3 rounded-[14px] border border-studio-border bg-studio-panel p-6 ${show('voice')}`}>
        <h2 className="text-lg font-semibold text-studio-bright">HeyGen voice</h2>
        <p className="text-xs text-studio-muted">
          Current voice id: <code>{(settings.heygen_voice_id as string) || 'not set'}</code>
        </p>
        {!voices ? (
          <button
            onClick={loadVoices}
            disabled={!!busy}
            className="rounded-[9px] border border-studio-border-strong px-3 py-1.5 text-sm text-studio-sub hover:bg-studio-inset disabled:opacity-50"
          >
            {busy === 'voices' ? 'Loading…' : 'Load English voices'}
          </button>
        ) : (
          <div className="flex gap-2">
            <select
              value={voices.some((v) => v.voice_id === voiceId) ? voiceId : ''}
              onChange={(e) => setVoiceId(e.target.value)}
              className="flex-1 rounded-[8px] border border-studio-border-strong bg-studio-inset px-2 py-1.5 text-sm"
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
              className="studio-lift rounded-[9px] bg-studio-accent px-3 py-1.5 text-sm font-semibold text-studio-on-accent disabled:opacity-50"
            >
              Save
            </button>
          </div>
        )}
        <div className="space-y-1.5 border-t border-studio-border pt-3">
          <label className="text-xs font-medium text-studio-sub">
            Or paste a custom voice ID
          </label>
          <p className="text-xs text-studio-muted">
            Cloned / custom voices don&apos;t appear in the list above. Paste the voice ID from
            HeyGen (Avatars &amp; Voices → your voice) and save it directly.
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={voiceId}
              onChange={(e) => setVoiceId(e.target.value.trim())}
              placeholder="e.g. 66b5794bec1b473b86cabf1529402d0f"
              className="flex-1 rounded-[8px] border border-studio-border-strong bg-studio-inset px-2 py-1.5 font-mono text-sm"
            />
            <button
              onClick={() => saveSetting('heygen_voice_id', voiceId)}
              disabled={!voiceId || !!busy}
              className="studio-lift rounded-[9px] bg-studio-accent px-3 py-1.5 text-sm font-semibold text-studio-on-accent disabled:opacity-50"
            >
              Save
            </button>
          </div>
        </div>
      </section>

      <section className={`space-y-3 rounded-[14px] border border-studio-border bg-studio-panel p-6 ${show('social')}`}>
        <h2 className="text-lg font-semibold text-studio-bright">GoHighLevel / social posting</h2>
        <p className="text-xs text-studio-muted">
          Posts go to the accounts in GHL_SOCIAL_ACCOUNT_IDS (comma-separated — TikTok,
          Instagram, Facebook, ...) as user GHL_USER_ID. Use this to look the ids up.
        </p>
        <button
          onClick={loadGhl}
          disabled={!!busy}
          className="rounded-[9px] border border-studio-border-strong px-3 py-1.5 text-sm text-studio-sub hover:bg-studio-inset disabled:opacity-50"
        >
          {busy === 'ghl' ? 'Loading…' : 'List connected social accounts'}
        </button>
        {ghlAccounts && (
          <ul className="space-y-1 text-xs">
            {ghlAccounts.map((a) => (
              <li key={a.id} className="rounded-[10px] border border-studio-border bg-studio-card px-3 py-2.5">
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

        <div className={show('api')}>{children}</div>
        </div>
      </div>
    </div>
  );
}
