import type { SupabaseClient } from '@supabase/supabase-js';
import {
  BOARD_COLUMNS,
  formatReviewerFeedback,
  generateScript,
  type Asset,
  type Job,
  type Script,
  type ScriptDirection,
  type ScriptVersion,
  type Video,
  type VideoStatus,
} from '@vd/shared';
import { estimateVideoCost } from '@vd/shared/pricing';
import { ApiError } from '@/lib/apiAuth';
import { getScriptGenContext, logEvent, saveScriptVersion } from '@/lib/scripts';
import { appUrl, r2 } from '@/lib/services';
import { newReviewToken } from '@/lib/tokens';

/**
 * Video service layer. Both the operator session routes and the /api/v1 key-authed
 * routes call these; `db` is a session client (RLS) or the service-role client.
 * Failures throw ApiError with the HTTP status the route should return.
 */

const VALID_STATUSES = new Set<VideoStatus>(BOARD_COLUMNS.flatMap((c) => c.statuses));

/** Statuses where the worker is actively producing — deletion would strand jobs. */
const ACTIVE_STATUSES: VideoStatus[] = [
  'script_generating',
  'voice_generating',
  'avatar_generating',
  'scenes_generating',
  'rendering',
];

export async function listVideos(
  db: SupabaseClient,
  opts: { status?: VideoStatus; limit?: number; offset?: number } = {},
): Promise<Video[]> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const offset = Math.max(opts.offset ?? 0, 0);
  let query = db
    .from('videos')
    .select('*')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (opts.status) {
    if (!VALID_STATUSES.has(opts.status)) throw new ApiError(400, `Invalid status: ${opts.status}`);
    query = query.eq('status', opts.status);
  }
  const { data, error } = await query;
  if (error) throw new ApiError(500, error.message);
  return (data ?? []) as Video[];
}

export interface VideoDetail {
  video: Video;
  script: ScriptVersion | null;
  script_version_count: number;
  assets: (Asset & { download_url?: string })[];
  jobs: Job[];
  review_links: { id: string; kind: string; revoked: boolean; expires_at: string; created_at: string }[];
  review_comments: unknown[];
  approvals: unknown[];
  events: unknown[];
  cost: ReturnType<typeof estimateVideoCost>;
}

export async function getVideoDetail(
  db: SupabaseClient,
  opts: { id: string; presignAssets?: boolean },
): Promise<VideoDetail> {
  const [
    { data: video },
    { data: assets },
    { data: jobs },
    { data: links },
    { data: events },
    { data: comments },
    { data: approvals },
  ] = await Promise.all([
    db.from('videos').select('*').eq('id', opts.id).single(),
    db.from('assets').select('*').eq('video_id', opts.id).order('created_at'),
    db.from('jobs').select('*').eq('video_id', opts.id).order('created_at'),
    db.from('review_links').select('id, kind, revoked, expires_at, created_at').eq('video_id', opts.id).order('created_at', { ascending: false }),
    db.from('pipeline_events').select('*').eq('video_id', opts.id).order('created_at', { ascending: false }).limit(30),
    db.from('review_comments').select('*').eq('video_id', opts.id).order('created_at', { ascending: false }),
    db.from('approvals').select('*').eq('video_id', opts.id).order('created_at', { ascending: false }),
  ]);
  if (!video) throw new ApiError(404, 'Video not found');

  let script: ScriptVersion | null = null;
  let versionCount = 0;
  if (video.current_script_version_id) {
    const [{ data: cur }, { count }] = await Promise.all([
      db.from('script_versions').select('*').eq('id', video.current_script_version_id).single(),
      db.from('script_versions').select('id', { count: 'exact', head: true }).eq('video_id', opts.id),
    ]);
    script = (cur ?? null) as ScriptVersion | null;
    versionCount = count ?? 0;
  }

  const assetList = (assets ?? []) as Asset[];
  let assetsOut: (Asset & { download_url?: string })[] = assetList;
  if (opts.presignAssets && assetList.length) {
    const client = r2();
    assetsOut = await Promise.all(
      assetList.map(async (a) => ({
        ...a,
        download_url: a.r2_key ? await client.presignGet(a.r2_key, 3600) : undefined,
      })),
    );
  }

  return {
    video: video as Video,
    script,
    script_version_count: versionCount,
    assets: assetsOut,
    jobs: (jobs ?? []) as Job[],
    review_links: links ?? [],
    review_comments: comments ?? [],
    approvals: approvals ?? [],
    events: events ?? [],
    cost: estimateVideoCost(assetList, (jobs ?? []) as Job[]),
  };
}

export async function createVideo(
  db: SupabaseClient,
  opts: { title: string; topic_brief?: string; generate?: boolean },
): Promise<{ video: Video; script: ScriptVersion | null }> {
  if (!opts.title?.trim()) throw new ApiError(400, 'Title is required');

  const { data: video, error } = await db
    .from('videos')
    .insert({
      title: opts.title.trim(),
      topic_brief: opts.topic_brief?.trim() || null,
      status: opts.generate ? 'script_generating' : 'draft',
    })
    .select()
    .single();
  if (error) throw new ApiError(500, error.message);

  await logEvent(db, video.id, 'video_created');

  let script: ScriptVersion | null = null;
  if (opts.generate && opts.topic_brief?.trim()) {
    try {
      const { systemPrompt, recentScripts, targetDurationS } = await getScriptGenContext(db, {
        excludeVideoId: video.id,
      });
      const generated = await generateScript({
        apiKey: process.env.ANTHROPIC_API_KEY!,
        topicBrief: opts.topic_brief,
        systemPrompt,
        recentScripts,
        targetDurationS,
      });
      script = await saveScriptVersion(db, {
        videoId: video.id,
        script: generated,
        createdBy: 'claude',
        claudeModel: generated.model,
      });
      await db.from('videos').update({ status: 'draft' }).eq('id', video.id);
      await logEvent(db, video.id, 'script_generated', {
        version: 1,
        words: generated.wordCount,
        estimated_s: Math.round(generated.estimatedDurationS),
        target_s: targetDurationS,
        condense_attempts: generated.condenseAttempts,
      });
    } catch (e) {
      await db
        .from('videos')
        .update({ status: 'draft', status_error: String(e) })
        .eq('id', video.id);
    }
  }

  return { video: video as Video, script };
}

/**
 * AI Script Generator: Claude invents a fresh topic (no operator brief), titles it,
 * writes the script, and the video lands directly in script_review for the client.
 * Generation runs before the insert so an AI failure leaves no orphan row.
 */
export async function generateVideoFromDirection(
  db: SupabaseClient,
  direction: ScriptDirection = {},
): Promise<{ video: Video; script: ScriptVersion }> {
  const { systemPrompt, recentScripts, allTitles, targetDurationS } =
    await getScriptGenContext(db);
  const generated = await generateScript({
    apiKey: process.env.ANTHROPIC_API_KEY!,
    direction,
    avoidTitles: allTitles,
    systemPrompt,
    recentScripts,
    targetDurationS,
  });

  const directionNote = [
    direction.tone?.trim() && `tone: ${direction.tone.trim()}`,
    direction.style?.trim() && `style: ${direction.style.trim()}`,
    direction.constraints?.trim() && `constraints: ${direction.constraints.trim()}`,
    direction.flow?.trim() && `flow: ${direction.flow.trim()}`,
  ]
    .filter(Boolean)
    .join('; ');

  const { data: video, error } = await db
    .from('videos')
    .insert({
      title: generated.title,
      topic_brief: directionNote ? `AI-generated. Direction — ${directionNote}` : null,
      status: 'draft',
    })
    .select()
    .single();
  if (error) throw new ApiError(500, error.message);

  await logEvent(db, video.id, 'video_created');
  const script = await saveScriptVersion(db, {
    videoId: video.id,
    script: generated,
    createdBy: 'claude',
    claudeModel: generated.model,
  });
  await logEvent(db, video.id, 'script_generated', {
    version: script.version,
    words: generated.wordCount,
    estimated_s: Math.round(generated.estimatedDurationS),
    target_s: targetDurationS,
    condense_attempts: generated.condenseAttempts,
  });

  const { error: statusErr } = await db
    .from('videos')
    .update({ status: 'script_review' })
    .eq('id', video.id);
  if (statusErr) throw new ApiError(500, statusErr.message);
  await logEvent(db, video.id, 'sent_for_script_review');

  return { video: { ...(video as Video), status: 'script_review' }, script };
}

export async function updateVideo(
  db: SupabaseClient,
  id: string,
  patch: {
    status?: VideoStatus;
    video_no?: number;
    title?: string;
    topic_brief?: string;
    caption?: string;
    schedule_at?: string | null;
  },
): Promise<void> {
  const update: Record<string, unknown> = {};
  if (patch.status !== undefined) {
    if (!VALID_STATUSES.has(patch.status)) throw new ApiError(400, `Invalid status: ${patch.status}`);
    update.status = patch.status;
  }
  if (patch.video_no !== undefined) {
    if (!Number.isInteger(patch.video_no) || patch.video_no < 1) {
      throw new ApiError(400, 'Video number must be a positive whole number');
    }
    update.video_no = patch.video_no;
  }
  if (patch.title !== undefined) update.title = patch.title;
  if (patch.topic_brief !== undefined) update.topic_brief = patch.topic_brief;
  if (patch.caption !== undefined) update.caption = patch.caption;
  if (patch.schedule_at !== undefined) update.schedule_at = patch.schedule_at;
  if (Object.keys(update).length === 0) throw new ApiError(400, 'Nothing to update');

  const { error } = await db.from('videos').update(update).eq('id', id);
  if (error) {
    if (error.code === '23505') {
      throw new ApiError(
        409,
        `V${patch.video_no} is already taken by another video — pick an unused number`,
      );
    }
    throw new ApiError(500, error.message);
  }
}

export async function deleteVideo(
  db: SupabaseClient,
  id: string,
): Promise<{ deleted: string }> {
  const { data: video } = await db
    .from('videos')
    .select('status, video_no, title')
    .eq('id', id)
    .single();
  if (!video) throw new ApiError(404, 'Video not found');

  if (ACTIVE_STATUSES.includes(video.status as VideoStatus)) {
    throw new ApiError(
      409,
      'This video is being processed right now — wait for the current step to finish (or fail) before deleting',
    );
  }

  const { error } = await db.from('videos').delete().eq('id', id);
  if (error) throw new ApiError(500, error.message);
  return { deleted: `V${video.video_no} ${video.title}` };
}

export type VideoActionName =
  | 'send_for_review'
  | 'retry_failed'
  | 'regenerate_scene'
  | 'regenerate_avatar'
  | 're_render';

export async function performVideoAction(
  db: SupabaseClient,
  id: string,
  opts: { action: VideoActionName; scene_index?: number },
): Promise<void> {
  const { data: video } = await db.from('videos').select('*').eq('id', id).single();
  if (!video) throw new ApiError(404, 'Video not found');

  switch (opts.action) {
    case 'send_for_review': {
      if (!video.current_script_version_id) throw new ApiError(400, 'No script to review yet');
      await db.from('videos').update({ status: 'script_review' }).eq('id', id);
      await logEvent(db, id, 'sent_for_script_review');
      return;
    }
    case 'retry_failed': {
      // Reset failed jobs; the worker recomputes video status as jobs progress.
      const { error } = await db
        .from('jobs')
        .update({ status: 'queued', attempts: 0, error: null, run_after: new Date().toISOString() })
        .eq('video_id', id)
        .eq('status', 'failed');
      if (error) throw new ApiError(500, error.message);
      await db.from('videos').update({ status_error: null }).eq('id', id);
      await logEvent(db, id, 'retry_failed_jobs');
      return;
    }
    case 'regenerate_scene': {
      if (!opts.scene_index) throw new ApiError(400, 'scene_index required');
      const { error } = await db.from('jobs').insert({
        video_id: id,
        type: 'scene',
        payload: { scene_index: opts.scene_index, regenerate: true },
      });
      if (error) throw new ApiError(500, error.message);
      await logEvent(db, id, 'scene_regenerate_requested', { scene_index: opts.scene_index });
      return;
    }
    case 'regenerate_avatar': {
      const { error } = await db
        .from('jobs')
        .insert({ video_id: id, type: 'avatar', payload: { regenerate: true } });
      if (error) throw new ApiError(500, error.message);
      await logEvent(db, id, 'avatar_regenerate_requested');
      return;
    }
    case 're_render': {
      const { error } = await db
        .from('jobs')
        .insert({ video_id: id, type: 'render', payload: { rerender: true } });
      if (error) throw new ApiError(500, error.message);
      await logEvent(db, id, 're_render_requested');
      return;
    }
    default:
      throw new ApiError(400, `Unknown action: ${String(opts.action)}`);
  }
}

export async function regenerateScript(
  db: SupabaseClient,
  id: string,
  opts: { instructions?: string; fresh?: boolean } = {},
): Promise<ScriptVersion> {
  const { data: video } = await db.from('videos').select('*').eq('id', id).single();
  if (!video) throw new ApiError(404, 'Video not found');

  let previous: Script | undefined;
  if (!opts.fresh && video.current_script_version_id) {
    const { data: cur } = await db
      .from('script_versions')
      .select('*')
      .eq('id', video.current_script_version_id)
      .single();
    if (cur) {
      const v = cur as ScriptVersion;
      previous = { hook: v.hook, cta: v.cta, scenes: v.scenes };
    }
  }

  // Fold in unresolved reviewer comments so regeneration addresses them.
  const { data: comments } = await db
    .from('review_comments')
    .select('id, section_key, body')
    .eq('video_id', id)
    .eq('resolved', false);
  const feedback = formatReviewerFeedback(comments ?? []);

  const { systemPrompt, recentScripts, targetDurationS } = await getScriptGenContext(db, {
    excludeVideoId: id,
  });
  const script = await generateScript({
    apiKey: process.env.ANTHROPIC_API_KEY!,
    topicBrief: video.topic_brief ?? video.title,
    previousScript: previous,
    instructions: [opts.instructions, feedback].filter(Boolean).join('\n\n'),
    systemPrompt,
    recentScripts,
    targetDurationS,
  });
  const version = await saveScriptVersion(db, {
    videoId: id,
    script,
    createdBy: 'claude',
    claudeModel: script.model,
  });
  // The comments were folded into the revision — mark them addressed.
  const commentIds = (comments ?? []).map((c) => c.id);
  if (commentIds.length) {
    await db.from('review_comments').update({ resolved: true }).in('id', commentIds);
  }
  if (video.status === 'script_changes_requested') {
    // Revision addressed the reviewer's comments — send it straight back.
    await db.from('videos').update({ status: 'script_review' }).eq('id', id);
    await logEvent(db, id, 'sent_for_script_review');
  } else if (video.status === 'script_generating') {
    await db.from('videos').update({ status: 'draft' }).eq('id', id);
  }
  await logEvent(db, id, 'script_regenerated', {
    version: version.version,
    words: script.wordCount,
    estimated_s: Math.round(script.estimatedDurationS),
    target_s: targetDurationS,
    condense_attempts: script.condenseAttempts,
  });
  return version;
}

export async function createReviewLink(
  db: SupabaseClient,
  videoId: string,
  kind: 'script' | 'video',
): Promise<{ url: string }> {
  if (kind !== 'script' && kind !== 'video') {
    throw new ApiError(400, 'kind must be script or video');
  }
  const { token, tokenHash } = newReviewToken();
  const { error } = await db.from('review_links').insert({
    video_id: videoId,
    kind,
    token_hash: tokenHash,
  });
  if (error) throw new ApiError(500, error.message);
  return { url: `${appUrl()}/review/${token}` };
}

export async function revokeReviewLink(
  db: SupabaseClient,
  videoId: string,
  linkId: string,
): Promise<void> {
  const { error } = await db
    .from('review_links')
    .update({ revoked: true })
    .eq('id', linkId)
    .eq('video_id', videoId);
  if (error) throw new ApiError(500, error.message);
}

/**
 * Apply a script/video review decision. Shared by the magic-link review route
 * (review_link_id set) and the v1 API (review_link_id null, reviewer like 'api:<key>').
 * Script approval kicks off the generation pipeline; video approval kicks off
 * caption + GHL scheduling.
 */
export async function applyReviewDecision(
  db: SupabaseClient,
  videoId: string,
  opts: {
    kind: 'script' | 'video';
    decision: 'approved' | 'changes_requested';
    comment?: string;
    reviewer_name?: string;
    review_link_id: string | null;
    /** Set for logged-in (session) reviewers; null/absent for token links and API keys. */
    reviewer_user_id?: string;
    reviewer_email?: string;
  },
): Promise<void> {
  if (opts.decision !== 'approved' && opts.decision !== 'changes_requested') {
    throw new ApiError(400, 'Invalid decision');
  }
  if (opts.decision === 'changes_requested' && !opts.comment?.trim()) {
    throw new ApiError(400, 'Please describe the changes you need');
  }

  const { data: video } = await db.from('videos').select('*').eq('id', videoId).single();
  if (!video) throw new ApiError(404, 'Video not found');

  const expectedStatus = opts.kind === 'script' ? 'script_review' : 'video_review';
  if (video.status !== expectedStatus) {
    throw new ApiError(
      409,
      `This ${opts.kind} is not awaiting review (current status: ${video.status})`,
    );
  }

  await db.from('approvals').insert({
    video_id: videoId,
    review_link_id: opts.review_link_id,
    kind: opts.kind,
    decision: opts.decision,
    comment: opts.comment?.trim() || null,
    reviewer_name: opts.reviewer_name?.trim() || 'Reviewer',
    // Spread so token/API flows keep their pre-0005 insert shape (columns may not exist yet).
    ...(opts.reviewer_user_id ? { reviewer_user_id: opts.reviewer_user_id } : {}),
    ...(opts.reviewer_email ? { reviewer_email: opts.reviewer_email } : {}),
  });

  if (opts.decision === 'changes_requested') {
    const next = opts.kind === 'script' ? 'script_changes_requested' : 'video_changes_requested';
    await db.from('videos').update({ status: next }).eq('id', videoId);
    if (opts.comment?.trim()) {
      await db.from('review_comments').insert({
        video_id: videoId,
        review_link_id: opts.review_link_id,
        section_key: opts.kind === 'video' ? 'video' : 'hook',
        author_name: opts.reviewer_name?.trim() || 'Reviewer',
        body: opts.comment.trim(),
        ...(opts.reviewer_user_id ? { reviewer_user_id: opts.reviewer_user_id } : {}),
        ...(opts.reviewer_email ? { reviewer_email: opts.reviewer_email } : {}),
      });
    }
    if (opts.kind === 'script') {
      // Auto-revise: the worker regenerates the script from the unresolved
      // comments and sends it straight back to review.
      await db.from('jobs').insert({ video_id: videoId, type: 'generate_script', payload: {} });
    }
    await db.from('pipeline_events').insert({
      video_id: videoId,
      event: `${opts.kind}_changes_requested`,
      detail: { reviewer: opts.reviewer_name },
    });
    return;
  }

  if (opts.kind === 'script') {
    // Approved script → start generation. The worker resolves the voice from
    // settings at run time, so a retry after a voice change uses the new voice.
    await db.from('videos').update({ status: 'voice_generating' }).eq('id', videoId);
    await db.from('jobs').insert({
      video_id: videoId,
      type: 'tts',
      payload: {},
    });
    await db.from('pipeline_events').insert({
      video_id: videoId,
      event: 'script_approved',
      detail: { reviewer: opts.reviewer_name },
    });
  } else {
    await db.from('videos').update({ status: 'approved' }).eq('id', videoId);
    await db.from('jobs').insert({ video_id: videoId, type: 'generate_caption', payload: {} });
    await db.from('pipeline_events').insert({
      video_id: videoId,
      event: 'video_approved',
      detail: { reviewer: opts.reviewer_name },
    });
  }
}
