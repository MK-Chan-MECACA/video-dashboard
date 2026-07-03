import { DEFAULT_RENDER_TEMPLATE, type RenderTemplate, type WordTimestamp } from '@vd/shared';
import { groupWordsIntoCues } from './ass';
import { bubbleCropPx } from './render';

/**
 * HyperFrames render path: instead of an ffmpeg filtergraph, the final video
 * is described as an HTML composition (https://github.com/heygen-com/hyperframes)
 * and rendered with `hyperframes render` (headless Chrome + ffmpeg). Layout is
 * driven by the same RenderTemplate setting as the ffmpeg engine.
 */

export interface HfSceneInput {
  /** Path relative to the project dir, e.g. "assets/scene_1.mp4". */
  file: string;
  windowStart: number;
  windowEnd: number;
}

export interface HfCompositionInput {
  avatarFile: string;
  avatarDurationS: number;
  scenes: HfSceneInput[];
  words: WordTimestamp[];
  logoFile?: string | null;
  /** width/height of the logo image; required when logoFile is set. */
  logoAspect?: number;
  outroFile?: string | null;
  outroIsVideo?: boolean;
  outroDurationS?: number;
  bgmFile?: string | null;
  template?: RenderTemplate;
}

export interface HfComposition {
  html: string;
  mainDurationS: number;
  outroDurationS: number;
  totalDurationS: number;
}

const W = 1080;
const H = 1920;
const GSAP_SRC = 'https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js';

const fmt = (n: number): string => String(Math.round(n * 1000) / 1000);

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** CSS placement for the logo box from the template corner + margins. */
export function logoCss(template: RenderTemplate['logo'], aspect: number): string {
  const w = template.widthPx;
  const h = Math.round(w / Math.max(aspect, 0.01));
  const m = template.marginPx;
  const pos =
    template.position === 'top_left' ? `top: ${m}px; left: ${m}px;`
    : template.position === 'top_center' ? `top: ${m}px; left: ${Math.round((W - w) / 2)}px;`
    : template.position === 'top_right' ? `top: ${m}px; right: ${m}px;`
    : template.position === 'bottom_left' ? `bottom: ${m}px; left: ${m}px;`
    : `bottom: ${m}px; right: ${m}px;`;
  // explicit dimensions — injected media does not resolve height:auto
  return `position: absolute; ${pos} width: ${w}px; height: ${h}px; object-fit: contain;`;
}

/**
 * CSS for the circular presenter bubble. The <video> element must stay a
 * direct child of the composition root (no wrapper divs), so the element is
 * oversized to achieve the head-crop zoom and clipped round with clip-path.
 */
export function bubbleCss(bubble: RenderTemplate['avatarBubble']): string {
  const { size, x, y } = bubbleCropPx(bubble.crop);
  const d = bubble.diameterPx;
  const k = d / size; // source px -> canvas px
  const elW = Math.round(W * k);
  const elH = Math.round(H * k);
  // circle centre in element coordinates
  const cx = Math.round((x + size / 2) * k);
  const cy = Math.round((y + size / 2) * k);
  // circle centre on the canvas
  const canvasCx = bubble.position === 'bottom_left' ? bubble.marginPx + d / 2 : W - bubble.marginPx - d / 2;
  const canvasCy = H - bubble.marginPx - d / 2;
  const left = Math.round(canvasCx - cx);
  const top = Math.round(canvasCy - cy);
  return (
    `position: absolute; left: ${left}px; top: ${top}px; width: ${elW}px; height: ${elH}px; ` +
    `object-fit: cover; clip-path: circle(${Math.round(d / 2)}px at ${cx}px ${cy}px);`
  );
}

export function buildHfComposition(input: HfCompositionInput): HfComposition {
  const template = input.template ?? DEFAULT_RENDER_TEMPLATE;
  const mainDur = input.avatarDurationS;
  const hasOutro = Boolean(input.outroFile);
  const outroDur = hasOutro ? (input.outroIsVideo ? (input.outroDurationS ?? 3) : 3) : 0;
  const totalDur = mainDur + outroDur;
  const subs = template.subtitles;

  const clips: string[] = [];

  // Track 0: full-screen talking head (muted; voiceover is a separate <audio>).
  clips.push(
    `<video id="avatar-full" class="fullscreen" src="${input.avatarFile}" data-start="0" data-duration="${fmt(mainDur)}" data-track-index="0" data-volume="0" muted playsinline></video>`,
  );

  // Track 1: B-roll scenes tiling the whole main video. Each staged file must
  // be at least as long as its window (the render handler pre-fits short
  // clips) — HyperFrames does NOT hold the last frame when a source runs out;
  // the element goes blank and exposes the avatar base.
  input.scenes.forEach((s, i) => {
    const dur = Math.max(0, Math.min(s.windowEnd, mainDur) - s.windowStart);
    if (dur <= 0) return;
    clips.push(
      `<video id="scene-${i + 1}" class="fullscreen" src="${s.file}" data-start="${fmt(s.windowStart)}" data-duration="${fmt(dur)}" data-track-index="1" data-volume="0" muted playsinline></video>`,
    );
  });

  // Track 2: circular presenter bubble, pinned for the whole main video —
  // the B-roll covers the full-screen avatar, so the bubble carries the face.
  if (template.avatarBubble.enabled) {
    clips.push(
      `<video id="bubble" class="bubble" src="${input.avatarFile}" data-start="0" data-duration="${fmt(mainDur)}" data-media-start="0" data-track-index="2" data-volume="0" muted playsinline></video>`,
    );
  }

  // Track 3: logo for the main part only (never the outro).
  if (input.logoFile) {
    clips.push(
      `<img id="logo" class="clip" src="${input.logoFile}" data-start="0" data-duration="${fmt(mainDur)}" data-track-index="3" />`,
    );
  }

  // Track 4: word-timed caption cues.
  const cues = groupWordsIntoCues(input.words);
  cues.forEach((c, i) => {
    if (c.start >= mainDur) return;
    const dur = Math.max(0.05, Math.min(c.end, mainDur) - c.start);
    clips.push(
      `<div id="cap-${i + 1}" class="caption clip" data-start="${fmt(c.start)}" data-duration="${fmt(dur)}" data-track-index="4">${escapeHtml(c.text)}</div>`,
    );
  });

  // Track 5: outro card / clip after the main part.
  if (input.outroFile) {
    clips.push(
      input.outroIsVideo
        ? `<video id="outro" class="fullscreen" src="${input.outroFile}" data-start="${fmt(mainDur)}" data-duration="${fmt(outroDur)}" data-track-index="5" data-volume="0" muted playsinline></video>`
        : `<img id="outro" class="clip fullscreen" src="${input.outroFile}" data-start="${fmt(mainDur)}" data-duration="${fmt(outroDur)}" data-track-index="5" />`,
    );
  }

  // Audio: voiceover from the avatar video + ducked BGM running through the
  // outro to the end of the video.
  clips.push(
    `<audio id="voiceover" src="${input.avatarFile}" data-start="0" data-duration="${fmt(mainDur)}" data-track-index="10" data-volume="1"></audio>`,
  );
  if (input.bgmFile) {
    clips.push(
      `<audio id="bgm" src="${input.bgmFile}" data-start="0" data-duration="${fmt(totalDur)}" data-track-index="11" data-volume="0.13"></audio>`,
    );
  }

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=${W}, height=${H}" />
    <script src="${GSAP_SRC}"></script>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { margin: 0; width: ${W}px; height: ${H}px; overflow: hidden; background: #000; }
      body { font-family: "Montserrat", "Inter", system-ui, sans-serif; }
      .fullscreen { position: absolute; inset: 0; width: ${W}px; height: ${H}px; object-fit: cover; }
      #logo { ${input.logoFile ? logoCss(template.logo, input.logoAspect ?? 1) : ''} }
      .bubble { ${template.avatarBubble.enabled ? bubbleCss(template.avatarBubble) : ''} }
      .caption {
        position: absolute;
        left: 60px;
        right: 60px;
        bottom: ${subs.marginVPx}px;
        text-align: center;
        font-size: ${subs.fontSizePx}px;
        font-weight: 800;
        line-height: 1.15;
        color: #fff;
        text-transform: ${subs.uppercase ? 'uppercase' : 'none'};
        -webkit-text-stroke: 4px #000;
        paint-order: stroke fill;
        text-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
      }
    </style>
  </head>
  <body>
    <div
      id="root"
      data-composition-id="main"
      data-start="0"
      data-duration="${fmt(totalDur)}"
      data-width="${W}"
      data-height="${H}"
    >
      ${clips.join('\n      ')}
    </div>

    <script>
      window.__timelines = window.__timelines || {};
      window.__timelines["main"] = gsap.timeline({ paused: true });
    </script>
  </body>
</html>
`;

  return { html, mainDurationS: mainDur, outroDurationS: outroDur, totalDurationS: totalDur };
}

/** Minimal sidecar files `hyperframes render` expects in a project dir. */
export function hfProjectFiles(name: string): { path: string; content: string }[] {
  return [
    {
      path: 'meta.json',
      content: JSON.stringify({ id: name, name }, null, 2) + '\n',
    },
    {
      path: 'hyperframes.json',
      content:
        JSON.stringify(
          {
            paths: { blocks: 'compositions', components: 'compositions/components', assets: 'assets' },
          },
          null,
          2,
        ) + '\n',
    },
  ];
}
