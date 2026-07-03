import type { WordTimestamp } from '@vd/shared';

export interface SubtitleCue {
  start: number;
  end: number;
  text: string;
}

const MAX_WORDS_PER_CUE = 4;
const MAX_GAP_S = 1.2;

/**
 * Group word timestamps into TikTok-style cues of 2-4 words.
 * A cue ends when: it reaches 4 words, the next word starts >1.2s after this
 * one ends (hard break), or the word ends with punctuation and we already
 * have at least 2 words.
 */
export function groupWordsIntoCues(words: WordTimestamp[]): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  let current: WordTimestamp[] = [];

  const flush = () => {
    if (current.length === 0) return;
    cues.push({
      start: current[0].start,
      end: current[current.length - 1].end,
      text: current.map((w) => w.word.trim()).filter(Boolean).join(' '),
    });
    current = [];
  };

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    current.push(w);
    const next = words[i + 1];
    const gapBreak = next != null && next.start - w.end > MAX_GAP_S;
    const punctBreak = /[.!?,;:]$/.test(w.word.trim()) && current.length >= 2;
    if (current.length >= MAX_WORDS_PER_CUE || gapBreak || punctBreak) flush();
  }
  flush();
  return cues;
}

/**
 * Escape text for an ASS Dialogue line. ASS has no escape for braces
 * (they open override blocks) so they are substituted; backslash starts
 * override tags so it is substituted too. Newlines become soft breaks.
 */
export function escapeAssText(text: string): string {
  return text
    .replace(/\\/g, '/')
    .replace(/\{/g, '(')
    .replace(/\}/g, ')')
    .replace(/\r?\n/g, '\\N');
}

/** ASS timestamps are H:MM:SS.cc (centiseconds). */
export function formatAssTime(seconds: number): string {
  const total = Math.max(0, seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = Math.floor(total % 60);
  const cs = Math.floor((total - Math.floor(total)) * 100);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${h}:${pad(m)}:${pad(s)}.${pad(cs)}`;
}

export interface AssStyleOptions {
  fontName?: string;
  fontSizePx?: number;
  /** Distance from the bottom of the 1920px frame to the subtitle block. */
  marginVPx?: number;
  uppercase?: boolean;
}

/**
 * Full ASS document, TikTok style: 1080x1920 canvas, big bold white text
 * with a black outline, bottom-center, raised well above the TikTok UI.
 * Falls back to DejaVu Sans (bundled in the Docker image) when Montserrat
 * ExtraBold is not installed — libass picks a substitute automatically.
 */
export function buildAss(words: WordTimestamp[], style: AssStyleOptions = {}): string {
  const fontName = style.fontName ?? 'Montserrat ExtraBold';
  const fontSize = style.fontSizePx ?? 64;
  const marginV = style.marginVPx ?? 420;
  const uppercase = style.uppercase ?? false;
  const cues = groupWordsIntoCues(words);
  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: TikTok,${fontName},${fontSize},&H00FFFFFF,&H00FFFFFF,&H00000000,&H7F000000,-1,0,0,0,100,100,0,0,1,4,1,2,60,60,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
  const events = cues
    .map((c) => {
      const text = uppercase ? c.text.toUpperCase() : c.text;
      return `Dialogue: 0,${formatAssTime(c.start)},${formatAssTime(c.end)},TikTok,,0,0,0,,${escapeAssText(text)}`;
    })
    .join('\n');
  return header + events + '\n';
}
