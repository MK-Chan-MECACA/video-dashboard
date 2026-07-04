import { z } from 'zod';

/**
 * Single source of truth for the MCP tool surface.
 * The dashboard's HTTP MCP endpoint (/api/mcp) registers these tools and executes
 * them in-process via the web app's service layer; the stdio package (ttm-video-mcp)
 * registers the same defs and executes them through the REST API via `rest`.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Args = Record<string, any>;

export interface ToolRestMapping {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: (args: Args) => string;
  body?: (args: Args) => unknown;
}

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: z.ZodRawShape;
  /** Tools that mutate state require an API key with the 'write' scope. */
  readOnly: boolean;
  rest: ToolRestMapping;
}

const sceneShape = z.object({
  index: z.number().int().min(1).max(3).describe('Scene number, 1-3'),
  voiceover: z.string().describe('What the presenter says during this scene'),
  broll_prompt: z.string().describe('Text-to-video prompt for the B-roll clip'),
  model_path: z
    .string()
    .describe('WaveSpeed model path, e.g. bytedance/seedance-v1-pro-t2v-720p'),
});

const qs = (params: Record<string, unknown>) => {
  const entries: [string, string][] = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => [k, String(v)]);
  return entries.length ? `?${new URLSearchParams(entries).toString()}` : '';
};

export const TOOL_DEFS: ToolDef[] = [
  {
    name: 'list_videos',
    description:
      'List videos in the pipeline with their status, title, video number, caption and schedule. Filter by status, paginate with limit/offset.',
    inputSchema: {
      status: z
        .string()
        .optional()
        .describe(
          "Filter by pipeline status (e.g. 'draft', 'script_review', 'rendering', 'video_review', 'posted', 'failed')",
        ),
      limit: z.number().int().min(1).max(200).optional(),
      offset: z.number().int().min(0).optional(),
    },
    readOnly: true,
    rest: {
      method: 'GET',
      path: (a) => `/api/v1/videos${qs({ status: a.status, limit: a.limit, offset: a.offset })}`,
    },
  },
  {
    name: 'get_video',
    description:
      'Full detail for one video: current script, jobs, generated assets with 1-hour download URLs, cost estimate, review links, reviewer comments, approvals and event timeline.',
    inputSchema: { video_id: z.string().describe('Video UUID') },
    readOnly: true,
    rest: { method: 'GET', path: (a) => `/api/v1/videos/${a.video_id}` },
  },
  {
    name: 'create_video',
    description:
      'Create a new video. With generate=true and a topic_brief, Claude writes the first script draft synchronously (takes ~30-90s).',
    inputSchema: {
      title: z.string().describe('Working title'),
      topic_brief: z.string().optional().describe('What the video should be about'),
      generate: z.boolean().optional().describe('Generate the first script draft with Claude'),
    },
    readOnly: false,
    rest: {
      method: 'POST',
      path: () => '/api/v1/videos',
      body: (a) => ({ title: a.title, topic_brief: a.topic_brief, generate: a.generate }),
    },
  },
  {
    name: 'update_video',
    description:
      'Update video fields: title, topic brief, caption, schedule time (ISO 8601), board status, or video number.',
    inputSchema: {
      video_id: z.string(),
      title: z.string().optional(),
      topic_brief: z.string().optional(),
      caption: z.string().optional().describe('Social post caption'),
      schedule_at: z.string().nullable().optional().describe('ISO 8601 posting time, or null to clear'),
      status: z.string().optional().describe('Board status (use with care — normally the pipeline moves this)'),
      video_no: z.number().int().min(1).optional(),
    },
    readOnly: false,
    rest: {
      method: 'PATCH',
      path: (a) => `/api/v1/videos/${a.video_id}`,
      body: ({ video_id: _, ...rest }) => rest,
    },
  },
  {
    name: 'delete_video',
    description:
      'Permanently delete a video and all its scripts, jobs and assets. Blocked while the pipeline is actively processing it.',
    inputSchema: { video_id: z.string() },
    readOnly: false,
    rest: { method: 'DELETE', path: (a) => `/api/v1/videos/${a.video_id}` },
  },
  {
    name: 'save_script',
    description:
      'Save an edited script (hook, 3 scenes, cta) as a new version and make it current.',
    inputSchema: {
      video_id: z.string(),
      hook: z.string().describe('Opening hook line'),
      scenes: z.array(sceneShape).length(3).describe('Exactly 3 scenes'),
      cta: z.string().describe('Call to action'),
    },
    readOnly: false,
    rest: {
      method: 'PUT',
      path: (a) => `/api/v1/videos/${a.video_id}/script`,
      body: (a) => ({ hook: a.hook, scenes: a.scenes, cta: a.cta }),
    },
  },
  {
    name: 'regenerate_script',
    description:
      'Regenerate the script with Claude (slow, ~30-90s). By default revises the current version and folds in unresolved reviewer comments; instructions steer the revision; fresh=true starts from scratch.',
    inputSchema: {
      video_id: z.string(),
      instructions: z.string().optional().describe('Guidance for the rewrite'),
      fresh: z.boolean().optional().describe('Ignore the current script and start over'),
    },
    readOnly: false,
    rest: {
      method: 'POST',
      path: (a) => `/api/v1/videos/${a.video_id}/script/regenerate`,
      body: (a) => ({ instructions: a.instructions, fresh: a.fresh }),
    },
  },
  {
    name: 'video_action',
    description:
      'Pipeline actions: send_for_review (script → reviewer), retry_failed (re-queue failed jobs), regenerate_scene (needs scene_index 1-3), regenerate_avatar, re_render.',
    inputSchema: {
      video_id: z.string(),
      action: z.enum([
        'send_for_review',
        'retry_failed',
        'regenerate_scene',
        'regenerate_avatar',
        're_render',
      ]),
      scene_index: z.number().int().min(1).max(3).optional().describe('Required for regenerate_scene'),
    },
    readOnly: false,
    rest: {
      method: 'POST',
      path: (a) => `/api/v1/videos/${a.video_id}/actions`,
      body: (a) => ({ action: a.action, scene_index: a.scene_index }),
    },
  },
  {
    name: 'review_decision',
    description:
      'Approve or request changes on a script or video. Approving a script starts voice/avatar/scene generation; approving a video starts caption writing and social scheduling. changes_requested requires a comment.',
    inputSchema: {
      video_id: z.string(),
      kind: z.enum(['script', 'video']),
      decision: z.enum(['approved', 'changes_requested']),
      comment: z.string().optional().describe('Required when requesting changes'),
      reviewer_name: z.string().optional(),
    },
    readOnly: false,
    rest: {
      method: 'POST',
      path: (a) => `/api/v1/videos/${a.video_id}/actions`,
      body: (a) => ({
        action:
          a.decision === 'approved'
            ? a.kind === 'script'
              ? 'approve_script'
              : 'approve_video'
            : a.kind === 'script'
              ? 'request_script_changes'
              : 'request_video_changes',
        comment: a.comment,
        reviewer_name: a.reviewer_name,
      }),
    },
  },
  {
    name: 'create_review_link',
    description:
      'Mint a magic review link (no login needed) to send a human reviewer for script or video approval. Expires in 14 days.',
    inputSchema: {
      video_id: z.string(),
      kind: z.enum(['script', 'video']),
    },
    readOnly: false,
    rest: {
      method: 'POST',
      path: (a) => `/api/v1/videos/${a.video_id}/review-links`,
      body: (a) => ({ kind: a.kind }),
    },
  },
  {
    name: 'get_asset_url',
    description:
      'Get a fresh presigned download URL (valid 1 hour) for a generated asset (voiceover, avatar video, scene clip, subtitles, final video, thumbnail).',
    inputSchema: { asset_id: z.string().describe('Asset UUID from get_video') },
    readOnly: true,
    rest: { method: 'GET', path: (a) => `/api/v1/assets/${a.asset_id}` },
  },
  {
    name: 'list_brand_assets',
    description:
      'List brand assets (logo, outro card, background music, avatar reference) with download URLs.',
    inputSchema: {},
    readOnly: true,
    rest: { method: 'GET', path: () => '/api/v1/brand-assets' },
  },
  {
    name: 'get_settings',
    description:
      "Read app settings (voice id, prompts, render engine/template, brand name). picker fetches live external lists: 'voices' (HeyGen), 'scene_models' (WaveSpeed), 'ghl' (connected social accounts).",
    inputSchema: {
      picker: z.enum(['voices', 'scene_models', 'ghl']).optional(),
    },
    readOnly: true,
    rest: {
      method: 'GET',
      path: (a) => `/api/v1/settings${a.picker ? `?${a.picker}=1` : ''}`,
    },
  },
  {
    name: 'update_settings',
    description:
      'Upsert app settings as key/value pairs (e.g. heygen_voice_id, script_system_prompt, caption_system_prompt, render_engine, brand_name).',
    inputSchema: {
      settings: z.record(z.unknown()).describe('Object of setting key → value'),
    },
    readOnly: false,
    rest: {
      method: 'PUT',
      path: () => '/api/v1/settings',
      body: (a) => a.settings,
    },
  },
];
