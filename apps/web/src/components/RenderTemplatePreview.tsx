'use client';

import { useState, type CSSProperties } from 'react';
import type { RenderTemplate } from '@vd/shared/renderTemplate';

/**
 * Live preview of the render layout template on a scaled 1080×1920 stage.
 * The placement math below is a 1:1 mirror of the HyperFrames engine
 * (apps/worker/src/render/hyperframes.ts: logoCss / bubbleCss / caption CSS
 * and render.ts: bubbleCropPx) — pixel values are used verbatim and the whole
 * stage is scaled down with a CSS transform.
 */

const W = 1080;
const H = 1920;
const SCALE = 240 / W;

/** Mirror of bubbleCropPx in apps/worker/src/render/render.ts. */
function bubbleCropPx(crop: RenderTemplate['avatarBubble']['crop']) {
  const size = 2 * Math.round((W * crop.widthFrac) / 2);
  const x = Math.min(W - size, Math.max(0, Math.round(W * crop.centerXFrac - size / 2)));
  const y = Math.min(H - size, Math.max(0, Math.round(H * crop.topFrac)));
  return { size, x, y };
}

/** Mirror of logoCss in apps/worker/src/render/hyperframes.ts. */
function logoStyle(logo: RenderTemplate['logo'], aspect: number): CSSProperties {
  const w = logo.widthPx;
  const h = Math.round(w / Math.max(aspect, 0.01));
  const m = logo.marginPx;
  const pos: CSSProperties =
    logo.position === 'top_left' ? { top: m, left: m }
    : logo.position === 'top_center' ? { top: m, left: Math.round((W - w) / 2) }
    : logo.position === 'top_right' ? { top: m, right: m }
    : logo.position === 'bottom_left' ? { bottom: m, left: m }
    : { bottom: m, right: m };
  return { position: 'absolute', ...pos, width: w, height: h, objectFit: 'contain' };
}

/** Mirror of bubbleCss in apps/worker/src/render/hyperframes.ts. */
function bubbleStyle(bubble: RenderTemplate['avatarBubble']): CSSProperties {
  const { size, x, y } = bubbleCropPx(bubble.crop);
  const d = bubble.diameterPx;
  const k = d / size;
  const elW = Math.round(W * k);
  const elH = Math.round(H * k);
  const cx = Math.round((x + size / 2) * k);
  const cy = Math.round((y + size / 2) * k);
  const canvasCx = bubble.position === 'bottom_left' ? bubble.marginPx + d / 2 : W - bubble.marginPx - d / 2;
  const canvasCy = H - bubble.marginPx - d / 2;
  return {
    position: 'absolute',
    left: Math.round(canvasCx - cx),
    top: Math.round(canvasCy - cy),
    width: elW,
    height: elH,
    objectFit: 'cover',
    clipPath: `circle(${Math.round(d / 2)}px at ${cx}px ${cy}px)`,
  };
}

const FULLSCREEN: CSSProperties = { position: 'absolute', inset: 0, width: W, height: H, objectFit: 'cover' };

/** Stand-in for the presenter when no avatar reference is uploaded. Head placement
 * roughly matches a typical 1080×1920 talking-head frame so the crop controls read true. */
function AvatarPlaceholder({ style }: { style: CSSProperties }) {
  return (
    <svg viewBox="0 0 1080 1920" preserveAspectRatio="xMidYMid slice" style={style}>
      <defs>
        <linearGradient id="tplprev-av" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3f3f46" />
          <stop offset="100%" stopColor="#18181b" />
        </linearGradient>
      </defs>
      <rect width="1080" height="1920" fill="url(#tplprev-av)" />
      <circle cx="540" cy="430" r="175" fill="#71717a" />
      <path d="M 250 1920 L 250 1080 Q 250 790 540 790 Q 830 790 830 1080 L 830 1920 Z" fill="#71717a" />
      <text x="540" y="1700" textAnchor="middle" fontSize="56" fill="#52525b" fontFamily="system-ui">
        PRESENTER
      </text>
    </svg>
  );
}

function ScenePlaceholder() {
  return (
    <svg viewBox="0 0 1080 1920" preserveAspectRatio="xMidYMid slice" style={FULLSCREEN}>
      <defs>
        <linearGradient id="tplprev-scene" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#1e3a5f" />
          <stop offset="100%" stopColor="#0f172a" />
        </linearGradient>
      </defs>
      <rect width="1080" height="1920" fill="url(#tplprev-scene)" />
      <path d="M 0 1400 L 360 950 L 620 1250 L 860 1000 L 1080 1300 L 1080 1920 L 0 1920 Z" fill="#16283f" />
      <circle cx="820" cy="500" r="110" fill="#27415f" />
      <text x="540" y="820" textAnchor="middle" fontSize="56" fill="#3b5876" fontFamily="system-ui">
        B-ROLL SCENE
      </text>
    </svg>
  );
}

/**
 * The presenter, drawn from the real avatar reference when available. A
 * worker-extracted poster frame is preferred over the raw video: browsers
 * can't always decode the reference footage (e.g. Safari has no 10-bit H.264
 * decoder). The placeholder always renders underneath: a <video> stays fully
 * transparent until a frame decodes (and paints nothing at all on load
 * failure or an unsupported codec), which would leave the bubble invisible.
 */
function AvatarLayer({
  src,
  posterSrc,
  isVideo,
  style,
}: {
  src?: string | null;
  posterSrc?: string | null;
  isVideo: boolean;
  style: CSSProperties;
}) {
  const [posterFailed, setPosterFailed] = useState(false);
  const [failed, setFailed] = useState(false);
  if (posterSrc && !posterFailed) {
    return (
      <>
        <AvatarPlaceholder style={style} />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={posterSrc} alt="" style={style} onError={() => setPosterFailed(true)} />
      </>
    );
  }
  return (
    <>
      <AvatarPlaceholder style={style} />
      {src && !failed && (
        isVideo ? (
          <video
            src={`${src}#t=0.1`}
            preload="auto"
            muted
            playsInline
            style={style}
            onError={() => setFailed(true)}
            // Safari ignores the #t fragment; seek explicitly to paint a frame
            onLoadedMetadata={(e) => {
              try {
                e.currentTarget.currentTime = 0.1;
              } catch {
                /* seeking before data is buffered can throw — placeholder covers it */
              }
            }}
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt="" style={style} onError={() => setFailed(true)} />
        )
      )}
    </>
  );
}

/** Dashed guide ring on the exact bubble circle, so placement is visible even before media loads. */
function bubbleRingStyle(bubble: RenderTemplate['avatarBubble']): CSSProperties {
  const d = bubble.diameterPx;
  const left = bubble.position === 'bottom_left' ? bubble.marginPx : W - bubble.marginPx - d;
  return {
    position: 'absolute',
    left,
    top: H - bubble.marginPx - d,
    width: d,
    height: d,
    borderRadius: '50%',
    border: '4px dashed rgba(250, 204, 21, 0.7)',
    boxSizing: 'border-box',
    pointerEvents: 'none',
  };
}

const SAFE_ZONE: CSSProperties = {
  position: 'absolute',
  background: 'rgba(244, 63, 94, 0.10)',
  border: '3px dashed rgba(244, 63, 94, 0.45)',
  color: 'rgba(251, 113, 133, 0.9)',
  fontSize: 32,
  fontFamily: 'system-ui',
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'center',
  paddingTop: 8,
};

export function RenderTemplatePreview({
  tpl,
  logoSrc,
  avatarSrc,
  avatarPosterSrc,
  avatarIsVideo,
}: {
  tpl: RenderTemplate;
  logoSrc?: string | null;
  avatarSrc?: string | null;
  avatarPosterSrc?: string | null;
  avatarIsVideo: boolean;
}) {
  const [mode, setMode] = useState<'broll' | 'avatar'>('broll');
  const [safeZones, setSafeZones] = useState(true);
  const [logoAspect, setLogoAspect] = useState(2.4);

  const subs = tpl.subtitles;
  const sampleCaption = 'This is how your subtitles look';

  return (
    <div className="space-y-2">
      <div
        className="relative overflow-hidden rounded-[10px] border border-studio-border-strong bg-black"
        style={{ width: Math.round(W * SCALE), height: Math.round(H * SCALE) }}
      >
        <div
          style={{
            width: W,
            height: H,
            transform: `scale(${SCALE})`,
            transformOrigin: 'top left',
            position: 'relative',
            background: '#000',
            fontFamily: '"Montserrat", "Inter", system-ui, sans-serif',
          }}
        >
          {mode === 'broll' ? (
            <ScenePlaceholder />
          ) : (
            <AvatarLayer src={avatarSrc} posterSrc={avatarPosterSrc} isVideo={avatarIsVideo} style={FULLSCREEN} />
          )}

          {mode === 'broll' && tpl.avatarBubble.enabled && (
            <>
              <AvatarLayer
                src={avatarSrc}
                posterSrc={avatarPosterSrc}
                isVideo={avatarIsVideo}
                style={bubbleStyle(tpl.avatarBubble)}
              />
              <div style={bubbleRingStyle(tpl.avatarBubble)} />
            </>
          )}

          {logoSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoSrc}
              alt="logo"
              style={logoStyle(tpl.logo, logoAspect)}
              onLoad={(e) => {
                const el = e.currentTarget;
                if (el.naturalWidth && el.naturalHeight) setLogoAspect(el.naturalWidth / el.naturalHeight);
              }}
            />
          ) : (
            <div
              style={{
                ...logoStyle(tpl.logo, logoAspect),
                border: '3px dashed rgba(163, 163, 163, 0.6)',
                borderRadius: 12,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 40,
                color: 'rgba(163, 163, 163, 0.8)',
                background: 'rgba(0, 0, 0, 0.25)',
              }}
            >
              LOGO
            </div>
          )}

          {/* Mirror of the .caption CSS in hyperframes.ts */}
          <div
            style={{
              position: 'absolute',
              left: 60,
              right: 60,
              bottom: subs.marginVPx,
              textAlign: 'center',
              fontSize: subs.fontSizePx,
              fontWeight: 800,
              lineHeight: 1.15,
              color: '#fff',
              textTransform: subs.uppercase ? 'uppercase' : 'none',
              WebkitTextStroke: '4px #000',
              paintOrder: 'stroke fill',
              textShadow: '0 2px 8px rgba(0, 0, 0, 0.5)',
            }}
          >
            {sampleCaption}
          </div>

          {safeZones && (
            <>
              <div style={{ ...SAFE_ZONE, right: 0, top: 1020, width: 150, height: 700 }}>UI</div>
              <div style={{ ...SAFE_ZONE, left: 0, right: 0, bottom: 0, height: 300 }}>PLATFORM UI</div>
            </>
          )}
        </div>
      </div>

      <div className="flex rounded-[8px] border border-studio-border-strong p-0.5 text-xs" style={{ width: Math.round(W * SCALE) }}>
        {(
          [
            ['broll', 'B-roll scene'],
            ['avatar', 'Talking head'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            onClick={() => setMode(value)}
            className={`flex-1 rounded-[6px] px-2 py-1 ${
              mode === value ? 'bg-studio-inset text-studio-bright' : 'text-studio-muted hover:text-studio-sub'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <label className="flex items-center gap-2 text-xs text-studio-sub">
        <input type="checkbox" checked={safeZones} onChange={(e) => setSafeZones(e.target.checked)} />
        Show platform UI zones
      </label>
      <p className="text-xs text-studio-faint" style={{ width: Math.round(W * SCALE) }}>
        Live preview using the render engine&apos;s exact layout math. The bubble appears only while
        B-roll plays; logo and subtitles show throughout the main part.
      </p>
    </div>
  );
}
