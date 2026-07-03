const BASE = 'https://api.wavespeed.ai/api/v3';

export interface PredictionResult {
  id: string;
  status: 'created' | 'processing' | 'completed' | 'failed';
  outputs: string[];
  error: string | null;
}

interface RawModel {
  model_id: string;
  name: string;
  type: string;
  description: string;
  sort_order: number;
  api_schema?: {
    api_schemas?: {
      request_schema?: { properties?: Record<string, RawSchemaProp> };
    }[];
  };
}

interface RawSchemaProp {
  type?: string;
  enum?: (string | number)[];
  minimum?: number;
  maximum?: number;
  default?: unknown;
}

export interface SceneModelOption {
  value: string; // model path, e.g. bytedance/seedance-2.0/text-to-video
  label: string; // e.g. "Seedance 2.0"
  description: string;
}

/** What a model's request schema allows — used to build a valid submit body. */
export interface SceneModelConstraints {
  durationEnum?: number[];
  durationMin?: number;
  durationMax?: number;
  supportsAspect916: boolean;
  supportsSeed: boolean;
  supportsGenerateAudio: boolean;
}

// The catalog is large (~1000 models) and changes rarely — cache per process.
let modelsCache: { at: number; models: RawModel[] } | null = null;
const MODELS_TTL_MS = 10 * 60 * 1000;

/**
 * Superseded model generations to hide from the scene-model picker. WaveSpeed
 * keeps old versions in the catalog indefinitely with no deprecated flag, so
 * prune any family that has a newer generation (checked against the catalog
 * 2026-07-03).
 */
const LEGACY_SCENE_MODELS: RegExp[] = [
  /\/seedance-v1/, // Seedance v1 / v1.5 → 2.0
  /\/kling-v[12]/, // Kling v1.6–v2.6 → v3
  /\/kling-video-o1/, // Kling O1 → O3
  /\/wan-2\.[1-6]\//, // WAN 2.1–2.6 → 2.7
  /\/happyhorse-1\.0\//, // HappyHorse 1.0 → 1.1
  /^google\/veo3(-fast)?$/, // Veo 3 → 3.1
  /^pika\//, // Pika v2 line, superseded elsewhere in the catalog
  /^luma\/ray-(1\.6|2(-flash)?)-t2v$/, // Ray 1.6 / 2 → 3.2
  /\/pixverse-v[45]/, // PixVerse v4.5–v5.6 → v6 / C1
  /\/hailuo-02\//, // Hailuo 02 → 2.3
  /^vidu\/text-to-video/, // old Vidu ids (q1 / q2 / 2.0) → Q3
  /^wavespeed-ai\/hunyuan-video\/t2v$/, // Hunyuan Video → 1.5
];

/** "bytedance/seedance-2.0/text-to-video-turbo" → "Seedance 2.0 Turbo" */
export function prettyModelLabel(modelId: string): string {
  const parts = modelId.split('/');
  const family = (parts[1] ?? parts[0])
    .split('-')
    .map((w) => (/^v?\d/.test(w) ? w.replace(/^v/, '') : w[0]?.toUpperCase() + w.slice(1)))
    .join(' ');
  const variant = (parts[2] ?? '')
    .replace(/^(text-to-video|t2v)/, '')
    .split('-')
    .filter(Boolean)
    .map((w) => w[0]?.toUpperCase() + w.slice(1))
    .join(' ');
  return [family, variant].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

function schemaProps(m: RawModel): Record<string, RawSchemaProp> {
  return m.api_schema?.api_schemas?.[0]?.request_schema?.properties ?? {};
}

/** Fit a wanted duration to a model's schema: smallest allowed enum value that
 *  covers it, or clamped range. Always rounds UP — a clip shorter than its
 *  window forces slowdown/freeze-frame padding at render time. */
export function coerceDuration(wantedS: number, c?: SceneModelConstraints): number {
  const wanted = Math.ceil(wantedS);
  if (c?.durationEnum?.length) {
    const atLeast = c.durationEnum.filter((v) => v >= wanted);
    return atLeast.length ? Math.min(...atLeast) : Math.max(...c.durationEnum);
  }
  const min = c?.durationMin ?? 2;
  const max = c?.durationMax ?? 12;
  return Math.min(Math.max(wanted, min), max);
}

export class WaveSpeedClient {
  constructor(private apiKey: string) {}

  private headers() {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    };
  }

  /** Submit any WaveSpeed model job. Returns the prediction id. */
  async submit(
    modelPath: string,
    body: Record<string, unknown>,
    webhookUrl?: string,
  ): Promise<string> {
    const url = `${BASE}/${modelPath}${webhookUrl ? `?webhook=${encodeURIComponent(webhookUrl)}` : ''}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`WaveSpeed submit ${modelPath} ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as { data?: { id?: string }; id?: string };
    const id = json.data?.id ?? json.id;
    if (!id) throw new Error(`WaveSpeed submit: no prediction id: ${JSON.stringify(json).slice(0, 300)}`);
    return id;
  }

  /** InfiniteTalk avatar from a silent reference video + voiceover audio. */
  submitAvatarVideoToVideo(opts: {
    videoUrl: string;
    audioUrl: string;
    resolution?: '480p' | '720p';
    prompt?: string;
    seed?: number;
    webhookUrl?: string;
  }): Promise<string> {
    return this.submit(
      'wavespeed-ai/infinitetalk/video-to-video',
      {
        video: opts.videoUrl,
        audio: opts.audioUrl,
        resolution: opts.resolution ?? '720p',
        ...(opts.prompt ? { prompt: opts.prompt } : {}),
        ...(opts.seed != null ? { seed: opts.seed } : {}),
      },
      opts.webhookUrl,
    );
  }

  /** InfiniteTalk avatar from a reference image + voiceover audio. */
  submitAvatarImage(opts: {
    imageUrl: string;
    audioUrl: string;
    resolution?: '480p' | '720p';
    prompt?: string;
    seed?: number;
    webhookUrl?: string;
  }): Promise<string> {
    return this.submit(
      'wavespeed-ai/infinitetalk',
      {
        image: opts.imageUrl,
        audio: opts.audioUrl,
        resolution: opts.resolution ?? '720p',
        ...(opts.prompt ? { prompt: opts.prompt } : {}),
        ...(opts.seed != null ? { seed: opts.seed } : {}),
      },
      opts.webhookUrl,
    );
  }

  /**
   * Text-to-video B-roll scene (any WaveSpeed t2v model — model path decides).
   * When constraints are provided (from getSceneModelConstraints), the body is
   * coerced to what the model actually accepts.
   */
  submitScene(opts: {
    modelPath: string;
    prompt: string;
    durationS?: number;
    seed?: number;
    webhookUrl?: string;
    constraints?: SceneModelConstraints;
  }): Promise<string> {
    const c = opts.constraints;
    const body: Record<string, unknown> = {
      prompt: opts.prompt,
      duration: coerceDuration(opts.durationS ?? 8, c),
    };
    if (!c || c.supportsAspect916) body.aspect_ratio = '9:16';
    // Scene clips are overlaid video-only in the render — skip native audio.
    if (c?.supportsGenerateAudio) body.generate_audio = false;
    if (opts.seed != null && (!c || c.supportsSeed)) body.seed = opts.seed;
    return this.submit(opts.modelPath, body, opts.webhookUrl);
  }

  private async listModels(): Promise<RawModel[]> {
    if (modelsCache && Date.now() - modelsCache.at < MODELS_TTL_MS) return modelsCache.models;
    const res = await fetch(`${BASE}/models`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    if (!res.ok) throw new Error(`WaveSpeed listModels ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as { data?: RawModel[] };
    modelsCache = { at: Date.now(), models: json.data ?? [] };
    return modelsCache.models;
  }

  /**
   * Current text-to-video catalog, featured models first (WaveSpeed's own
   * ordering), restricted to models that can generate 9:16 clips.
   */
  async listSceneModels(): Promise<SceneModelOption[]> {
    const models = await this.listModels();
    return models
      .filter((m) => {
        if (m.type !== 'text-to-video') return false;
        if (LEGACY_SCENE_MODELS.some((re) => re.test(m.model_id))) return false;
        const aspect = schemaProps(m).aspect_ratio;
        return !aspect?.enum || aspect.enum.includes('9:16');
      })
      .sort((a, b) => (b.sort_order ?? 0) - (a.sort_order ?? 0))
      .map((m) => ({
        value: m.model_id,
        label: prettyModelLabel(m.model_id),
        description: m.description ?? '',
      }));
  }

  /** Parse a model's request schema so scene submits stay within its limits. */
  async getSceneModelConstraints(modelPath: string): Promise<SceneModelConstraints> {
    const models = await this.listModels();
    const m = models.find((x) => x.model_id === modelPath);
    const props = m ? schemaProps(m) : {};
    const dur = props.duration;
    return {
      durationEnum: dur?.enum?.every((v) => typeof v === 'number')
        ? (dur.enum as number[])
        : undefined,
      durationMin: dur?.minimum,
      durationMax: dur?.maximum,
      supportsAspect916: !props.aspect_ratio?.enum || props.aspect_ratio.enum.includes('9:16'),
      supportsSeed: 'seed' in props,
      supportsGenerateAudio: 'generate_audio' in props,
    };
  }

  async getResult(predictionId: string): Promise<PredictionResult> {
    const res = await fetch(`${BASE}/predictions/${predictionId}/result`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    if (!res.ok) throw new Error(`WaveSpeed getResult ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as { data?: Record<string, unknown> };
    const d = (json.data ?? json) as Record<string, unknown>;
    return {
      id: String(d.id ?? predictionId),
      status: (d.status ?? 'processing') as PredictionResult['status'],
      outputs: Array.isArray(d.outputs) ? (d.outputs as string[]) : [],
      error: (d.error as string) || null,
    };
  }
}

/**
 * Verify a WaveSpeed webhook signature.
 * signedContent = `${webhookId}.${timestamp}.${body}`; HMAC-SHA256 with the
 * webhook secret (base64 portion after the `whsec_` prefix), base64 output.
 */
export async function verifyWaveSpeedWebhook(opts: {
  secret: string;
  webhookId: string;
  timestamp: string;
  signatureHeader: string; // may contain multiple space-delimited `v1,<sig>` entries
  body: string;
}): Promise<boolean> {
  const { createHmac, timingSafeEqual } = await import('node:crypto');
  const secretRaw = opts.secret.startsWith('whsec_') ? opts.secret.slice(6) : opts.secret;
  const key = Buffer.from(secretRaw, 'base64');
  const signedContent = `${opts.webhookId}.${opts.timestamp}.${opts.body}`;
  const expected = createHmac('sha256', key.length ? key : Buffer.from(secretRaw))
    .update(signedContent)
    .digest('base64');
  const candidates = opts.signatureHeader
    .split(' ')
    .map((p) => (p.includes(',') ? p.split(',')[1] : p))
    .filter(Boolean);
  return candidates.some((sig) => {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  });
}
