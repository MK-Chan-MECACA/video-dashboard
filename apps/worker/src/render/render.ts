import {
  DEFAULT_BGM_VOLUME,
  DEFAULT_RENDER_TEMPLATE,
  type BubblePosition,
  type LogoPosition,
  type RenderTemplate,
  type WordTimestamp,
} from '@vd/shared';
import { buildAss } from './ass';

export interface RenderSceneInput {
  path: string;
  durationS: number;
  windowStart: number;
  windowEnd: number;
}

export interface RenderPlanInput {
  avatarPath: string;
  avatarDurationS: number;
  /** Ordered by scene index. */
  scenes: RenderSceneInput[];
  words: WordTimestamp[];
  /** Where the caller will write plan.subs before running ffmpeg. */
  subsPath: string;
  outPath: string;
  logoPath?: string | null;
  outroPath?: string | null;
  outroIsVideo?: boolean;
  /** Required when outroIsVideo; images default to 3s. */
  outroDurationS?: number;
  bgmPath?: string | null;
  /** BGM level (linear 0-1); defaults to DEFAULT_BGM_VOLUME. */
  bgmVolume?: number;
  fontsDir?: string | null;
  /** Layout template; defaults to DEFAULT_RENDER_TEMPLATE. */
  template?: RenderTemplate;
  /** Circular grayscale mask (bubble diameter × diameter) — required for the avatar bubble. */
  bubbleMaskPath?: string | null;
}

export interface RenderPlan {
  args: string[];
  subs: string;
  mainDurationS: number;
  outroDurationS: number;
  totalDurationS: number;
}

const fmt = (n: number): string => String(Math.round(n * 1000) / 1000);

/**
 * Fit a B-roll clip into its voiceover window: slow it down up to 1.25x
 * longer if it's short; if still short, clone the last frame (tpad).
 */
export function fitClipToWindow(
  clipDurationS: number,
  windowDurationS: number,
): { setptsFactor: number; tpadSeconds: number } {
  if (clipDurationS <= 0) return { setptsFactor: 1, tpadSeconds: windowDurationS };
  if (clipDurationS >= windowDurationS) return { setptsFactor: 1, tpadSeconds: 0 };
  const setptsFactor = Math.min(windowDurationS / clipDurationS, 1.25);
  const stretched = clipDurationS * setptsFactor;
  return { setptsFactor, tpadSeconds: Math.max(0, windowDurationS - stretched) };
}

/**
 * Escape a path for use as an ffmpeg filter option value (e.g. subtitles
 * filename): backslash-escape \ ' : , then wrap in single quotes for the
 * filtergraph parser.
 */
export function escapeFilterPath(p: string): string {
  const escaped = p
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/:/g, '\\:')
    .replace(/,/g, '\\,');
  return `'${escaped}'`;
}

const SCALE_CROP = 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30';
const FRAME_W = 1080;
const FRAME_H = 1920;

/** Overlay x:y filter expressions for a corner placement with a margin. */
export function overlayPosition(position: LogoPosition | BubblePosition, marginPx: number): string {
  const m = String(marginPx);
  switch (position) {
    case 'top_left': return `x=${m}:y=${m}`;
    case 'top_center': return `x=(W-w)/2:y=${m}`;
    case 'top_right': return `x=W-w-${m}:y=${m}`;
    case 'bottom_left': return `x=${m}:y=H-h-${m}`;
    case 'bottom_right': return `x=W-w-${m}:y=H-h-${m}`;
  }
}

/** Pixel square crop of the 1080x1920 avatar frame for the head bubble. */
export function bubbleCropPx(crop: RenderTemplate['avatarBubble']['crop']): {
  size: number;
  x: number;
  y: number;
} {
  const size = 2 * Math.round((FRAME_W * crop.widthFrac) / 2);
  const x = Math.min(FRAME_W - size, Math.max(0, Math.round(FRAME_W * crop.centerXFrac - size / 2)));
  const y = Math.min(FRAME_H - size, Math.max(0, Math.round(FRAME_H * crop.topFrac)));
  return { size, x, y };
}

/**
 * Build the full single-pass ffmpeg invocation (pure — no I/O, unit testable).
 *
 * Video chain: avatar as base (failsafe only — the contiguous scene windows
 * cover it completely) -> each scene scaled/fitted/PTS-shifted and overlaid
 * inside its coverage window -> circular avatar head bubble (template-
 * controlled, pinned for the whole main video) -> logo overlay -> burned ASS
 * subtitles -> concat with the outro (subtitles/logo never touch the outro).
 * Audio: avatar voiceover (silence-padded through the outro) + looped BGM
 * ducked to input.bgmVolume playing to the end of the outro with a 3s fade-out.
 */
export function buildRenderPlan(input: RenderPlanInput): RenderPlan {
  const template = input.template ?? DEFAULT_RENDER_TEMPLATE;
  const bgmVolume = input.bgmVolume ?? DEFAULT_BGM_VOLUME;
  const bubble = template.avatarBubble;
  const useBubble = bubble.enabled && Boolean(input.bubbleMaskPath) && input.scenes.length > 0;
  const mainDur = input.avatarDurationS;
  const hasOutro = Boolean(input.outroPath);
  const outroDur = hasOutro ? (input.outroIsVideo ? (input.outroDurationS ?? 3) : 3) : 0;
  const totalDur = mainDur + outroDur;

  // --- inputs ---
  const args: string[] = ['-y', '-hide_banner', '-i', input.avatarPath];
  let nextIdx = 1;
  const sceneIdx = input.scenes.map((s) => {
    args.push('-i', s.path);
    return nextIdx++;
  });
  let logoIdx = -1;
  if (input.logoPath) {
    args.push('-loop', '1', '-t', fmt(mainDur), '-i', input.logoPath);
    logoIdx = nextIdx++;
  }
  let outroIdx = -1;
  if (input.outroPath) {
    if (input.outroIsVideo) args.push('-i', input.outroPath);
    else args.push('-loop', '1', '-t', fmt(outroDur), '-i', input.outroPath);
    outroIdx = nextIdx++;
  }
  let bgmIdx = -1;
  if (input.bgmPath) {
    args.push('-stream_loop', '-1', '-i', input.bgmPath);
    bgmIdx = nextIdx++;
  }
  let maskIdx = -1;
  if (useBubble && input.bubbleMaskPath) {
    args.push('-loop', '1', '-t', fmt(mainDur), '-i', input.bubbleMaskPath);
    maskIdx = nextIdx++;
  }

  // --- filtergraph ---
  const fg: string[] = [];
  if (useBubble) {
    // The scaled avatar feeds both the full-screen base and the head bubble.
    fg.push(`[0:v]${SCALE_CROP},split=2[base][avsrc]`);
  } else {
    fg.push(`[0:v]${SCALE_CROP}[base]`);
  }
  let last = 'base';
  input.scenes.forEach((s, i) => {
    const windowDur = s.windowEnd - s.windowStart;
    const { setptsFactor, tpadSeconds } = fitClipToWindow(s.durationS, windowDur);
    const chain = [SCALE_CROP];
    if (setptsFactor !== 1) chain.push(`setpts=${fmt(setptsFactor)}*PTS`);
    if (tpadSeconds > 0.01) chain.push(`tpad=stop_mode=clone:stop_duration=${fmt(tpadSeconds)}`);
    // Shift the clip so its first frame lands at the window start, then
    // gate visibility to the window with enable=between(t,...).
    chain.push(`setpts=PTS-STARTPTS+${fmt(s.windowStart)}/TB`);
    fg.push(`[${sceneIdx[i]}:v]${chain.join(',')}[sc${i}]`);
    fg.push(
      `[${last}][sc${i}]overlay=x=0:y=0:eof_action=pass:enable='between(t,${fmt(s.windowStart)},${fmt(s.windowEnd)})'[ov${i}]`,
    );
    last = `ov${i}`;
  });

  if (useBubble && maskIdx >= 0) {
    // Circular head bubble: crop the presenter's head out of the avatar frame,
    // shrink it to the bubble diameter, punch it round with the mask's alpha,
    // and keep it pinned on screen for the whole main video (the B-roll covers
    // the full-screen avatar edge to edge, so the bubble carries the presenter).
    const c = bubbleCropPx(bubble.crop);
    const d = bubble.diameterPx;
    fg.push(`[avsrc]crop=${c.size}:${c.size}:${c.x}:${c.y},scale=${d}:${d},format=yuv420p[avhead]`);
    fg.push(`[${maskIdx}:v]format=gray[bmask]`);
    fg.push(`[avhead][bmask]alphamerge[bubble]`);
    fg.push(
      `[${last}][bubble]overlay=${overlayPosition(bubble.position, bubble.marginPx)}:eof_action=pass:enable='between(t,0,${fmt(mainDur)})'[withbubble]`,
    );
    last = 'withbubble';
  }

  if (logoIdx >= 0) {
    fg.push(`[${logoIdx}:v]scale=w=${template.logo.widthPx}:h=-1[logo]`);
    fg.push(
      `[${last}][logo]overlay=${overlayPosition(template.logo.position, template.logo.marginPx)}:eof_action=pass:enable='between(t,0,${fmt(mainDur)})'[withlogo]`,
    );
    last = 'withlogo';
  }

  const subsFilter =
    `subtitles=filename=${escapeFilterPath(input.subsPath)}` +
    (input.fontsDir ? `:fontsdir=${escapeFilterPath(input.fontsDir)}` : '');
  fg.push(`[${last}]${subsFilter}[subbed]`);
  last = 'subbed';

  if (outroIdx >= 0) {
    // Normalize pixel format / SAR on both branches so concat accepts them.
    fg.push(`[${last}]format=yuv420p,setsar=1[mainv]`);
    fg.push(`[${outroIdx}:v]${SCALE_CROP},format=yuv420p,setsar=1[outrov]`);
    fg.push(`[mainv][outrov]concat=n=2:v=1:a=0[vout]`);
  } else {
    fg.push(`[${last}]format=yuv420p[vout]`);
  }

  if (bgmIdx >= 0) {
    // Pad the voiceover with silence through the outro BEFORE the mix, so
    // amix duration=first keeps the looped BGM playing under the outro; the
    // BGM fade-out covers the last 3s of the whole video.
    const fadeStart = Math.max(0, totalDur - 3);
    fg.push(`[0:a]apad=whole_dur=${fmt(totalDur)}[vo]`);
    fg.push(`[${bgmIdx}:a]volume=${fmt(bgmVolume)},afade=t=out:st=${fmt(fadeStart)}:d=3[bgm]`);
    fg.push(`[vo][bgm]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[aout]`);
  } else {
    fg.push(`[0:a]apad=whole_dur=${fmt(totalDur)}[aout]`);
  }

  args.push(
    '-filter_complex', fg.join(';'),
    '-map', '[vout]',
    '-map', '[aout]',
    '-c:v', 'libx264',
    // veryfast + capped threads/lookahead keep peak RSS within a small
    // container (medium preset OOM-killed the render on Railway's default
    // memory). TikTok recompresses anyway; visual difference is negligible.
    '-preset', 'veryfast',
    '-x264-params', 'rc-lookahead=20',
    '-threads', '2',
    '-crf', '20',
    '-pix_fmt', 'yuv420p',
    '-r', '30',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-movflags', '+faststart',
    input.outPath,
  );

  return {
    args,
    subs: buildAss(input.words, {
      fontSizePx: template.subtitles.fontSizePx,
      marginVPx: template.subtitles.marginVPx,
      uppercase: template.subtitles.uppercase,
    }),
    mainDurationS: mainDur,
    outroDurationS: outroDur,
    totalDurationS: totalDur,
  };
}

/** Thumbnail grab from the rendered final video. */
export function buildThumbnailArgs(finalPath: string, thumbPath: string): string[] {
  return ['-y', '-hide_banner', '-ss', '0.5', '-i', finalPath, '-frames:v', '1', '-q:v', '3', thumbPath];
}
