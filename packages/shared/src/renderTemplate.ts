/**
 * Layout template for the final render — controls where the logo sits, how
 * subtitles are styled, and whether the avatar shrinks into a circular head
 * bubble while B-roll scenes play. Stored in app_settings under the key
 * `render_template` (deep-partial; missing fields fall back to defaults).
 * All pixel values are on the 1080x1920 output canvas.
 */

export type LogoPosition =
  | 'top_left'
  | 'top_center'
  | 'top_right'
  | 'bottom_left'
  | 'bottom_right';

export type BubblePosition = 'bottom_left' | 'bottom_right';

export interface RenderTemplate {
  logo: {
    position: LogoPosition;
    /** Rendered logo width in px (height keeps aspect). */
    widthPx: number;
    /** Distance from the frame edges in px. */
    marginPx: number;
  };
  subtitles: {
    fontSizePx: number;
    /** Distance from the bottom of the frame to the subtitle block in px. */
    marginVPx: number;
    uppercase: boolean;
  };
  avatarBubble: {
    /** Show the presenter in a circle while B-roll scenes play. */
    enabled: boolean;
    position: BubblePosition;
    diameterPx: number;
    marginPx: number;
    /** Square head crop of the 1080x1920 avatar frame, as fractions. */
    crop: {
      /** Crop square size as a fraction of frame width (zoom: smaller = tighter on the head). */
      widthFrac: number;
      /** Horizontal center of the crop, 0 = left edge, 1 = right edge. */
      centerXFrac: number;
      /** Top edge of the crop as a fraction of frame height. */
      topFrac: number;
    };
  };
}

export const DEFAULT_RENDER_TEMPLATE: RenderTemplate = {
  logo: { position: 'top_right', widthPx: 240, marginPx: 30 },
  subtitles: { fontSizePx: 64, marginVPx: 560, uppercase: true },
  avatarBubble: {
    enabled: true,
    position: 'bottom_left',
    diameterPx: 460,
    marginPx: 24,
    crop: { widthFrac: 0.6, centerXFrac: 0.5, topFrac: 0.02 },
  },
};

const clamp = (n: unknown, min: number, max: number, fallback: number): number => {
  const v = typeof n === 'number' && Number.isFinite(n) ? n : fallback;
  return Math.min(max, Math.max(min, v));
};

const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(v as T) ? (v as T) : fallback;

const obj = (v: unknown): Record<string, unknown> =>
  v != null && typeof v === 'object' ? (v as Record<string, unknown>) : {};

/** Merge a stored (possibly partial/invalid) template over the defaults, clamping every value. */
export function resolveRenderTemplate(raw: unknown): RenderTemplate {
  const d = DEFAULT_RENDER_TEMPLATE;
  const r = obj(raw);
  const logo = obj(r.logo);
  const subs = obj(r.subtitles);
  const bubble = obj(r.avatarBubble);
  const crop = obj(bubble.crop);
  return {
    logo: {
      position: pick(logo.position, ['top_left', 'top_center', 'top_right', 'bottom_left', 'bottom_right'], d.logo.position),
      widthPx: Math.round(clamp(logo.widthPx, 60, 1080, d.logo.widthPx)),
      marginPx: Math.round(clamp(logo.marginPx, 0, 400, d.logo.marginPx)),
    },
    subtitles: {
      fontSizePx: Math.round(clamp(subs.fontSizePx, 24, 160, d.subtitles.fontSizePx)),
      marginVPx: Math.round(clamp(subs.marginVPx, 0, 1600, d.subtitles.marginVPx)),
      uppercase: typeof subs.uppercase === 'boolean' ? subs.uppercase : d.subtitles.uppercase,
    },
    avatarBubble: {
      enabled: typeof bubble.enabled === 'boolean' ? bubble.enabled : d.avatarBubble.enabled,
      position: pick(bubble.position, ['bottom_left', 'bottom_right'], d.avatarBubble.position),
      // even diameter so the scaled crop is a valid yuv frame size
      diameterPx: 2 * Math.round(clamp(bubble.diameterPx, 120, 900, d.avatarBubble.diameterPx) / 2),
      marginPx: Math.round(clamp(bubble.marginPx, -200, 400, d.avatarBubble.marginPx)),
      crop: {
        widthFrac: clamp(crop.widthFrac, 0.2, 1, d.avatarBubble.crop.widthFrac),
        centerXFrac: clamp(crop.centerXFrac, 0, 1, d.avatarBubble.crop.centerXFrac),
        topFrac: clamp(crop.topFrac, 0, 0.8, d.avatarBubble.crop.topFrac),
      },
    },
  };
}
