import type { WordTimestamp } from './types';

const BASE = 'https://api.heygen.com';

export interface HeyGenVoice {
  voice_id: string;
  name: string;
  language: string;
  gender: string;
  preview_audio?: string;
}

export interface SpeechResult {
  audioUrl: string;
  duration: number;
  wordTimestamps: WordTimestamp[];
  raw: unknown;
}

export class HeyGenClient {
  constructor(private apiKey: string) {}

  private headers() {
    return {
      'X-Api-Key': this.apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
  }

  /**
   * v3 voices only: generateSpeech below runs on HeyGen's v3 ("Starfish")
   * engine, and the much larger /v2/voices catalog is mostly voices that
   * engine rejects with "Voice engine VoiceProvider.STARFISH is not
   * supported for voice ...".
   */
  async listVoices(): Promise<HeyGenVoice[]> {
    const res = await fetch(`${BASE}/v3/voices`, { headers: this.headers() });
    if (!res.ok) throw new Error(`HeyGen listVoices ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as { data?: Array<Record<string, unknown>> };
    return (json.data ?? []).map((v) => ({
      voice_id: String(v.voice_id ?? ''),
      name: String(v.name ?? '').trim(),
      language: String(v.language ?? ''),
      gender: String(v.gender ?? ''),
      preview_audio: (v.preview_audio_url ?? v.preview_audio) as string | undefined,
    }));
  }

  /**
   * Synchronous TTS. Returns an mp3 URL plus word-level timestamps
   * that drive both subtitles and B-roll scene windows.
   */
  async generateSpeech(opts: {
    text: string;
    voiceId: string;
    speed?: number;
    language?: string;
  }): Promise<SpeechResult> {
    if (opts.text.length > 5000) {
      throw new Error(`HeyGen TTS text too long: ${opts.text.length} > 5000 chars`);
    }
    const res = await fetch(`${BASE}/v3/voices/speech`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        text: opts.text,
        voice_id: opts.voiceId,
        input_type: 'text',
        speed: opts.speed ?? 1.0,
        ...(opts.language ? { language: opts.language } : {}),
      }),
    });
    if (!res.ok) throw new Error(`HeyGen speech ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as Record<string, unknown>;
    // Response shape can be flat or under `data` — handle both.
    const data = (json.data ?? json) as Record<string, unknown>;
    const audioUrl = (data.audio_url ?? data.audioUrl) as string | undefined;
    if (!audioUrl) {
      throw new Error(`HeyGen speech: no audio_url in response: ${JSON.stringify(json).slice(0, 500)}`);
    }
    return {
      audioUrl,
      duration: Number(data.duration ?? 0),
      wordTimestamps: normalizeWordTimestamps(data.word_timestamps),
      raw: json,
    };
  }
}

/**
 * HeyGen brackets the transcript with zero-duration marker tokens like
 * "<start>" / "<end>". They are not speech: left in, they render as a
 * subtitle word and shift computeSectionWindows off by one per marker.
 */
const MARKER_WORD = /^<[^<>]*>$/;

export function stripMarkerWords(words: WordTimestamp[]): WordTimestamp[] {
  return words.filter((w) => !MARKER_WORD.test(w.word.trim()));
}

/** HeyGen's word timestamp field naming may vary; normalize defensively. */
export function normalizeWordTimestamps(input: unknown): WordTimestamp[] {
  if (!Array.isArray(input)) return [];
  const words = input
    .map((w) => {
      const o = w as Record<string, unknown>;
      const word = (o.word ?? o.text ?? '') as string;
      const start = Number(o.start ?? o.start_time ?? o.startTime ?? NaN);
      const end = Number(o.end ?? o.end_time ?? o.endTime ?? NaN);
      if (!word || Number.isNaN(start) || Number.isNaN(end)) return null;
      return { word, start, end };
    })
    .filter((w): w is WordTimestamp => w !== null);
  return stripMarkerWords(words);
}
