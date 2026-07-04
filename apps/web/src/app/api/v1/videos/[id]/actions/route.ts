import { ApiError, requireApiKey } from '@/lib/apiAuth';
import { handleApi } from '@/lib/apiResponse';
import { applyReviewDecision, performVideoAction, type VideoActionName } from '@/lib/videos';

type Params = { params: Promise<{ id: string }> };

const PIPELINE_ACTIONS: VideoActionName[] = [
  'send_for_review',
  'retry_failed',
  'regenerate_scene',
  'regenerate_avatar',
  're_render',
];

const REVIEW_ACTIONS: Record<string, { kind: 'script' | 'video'; decision: 'approved' | 'changes_requested' }> = {
  approve_script: { kind: 'script', decision: 'approved' },
  request_script_changes: { kind: 'script', decision: 'changes_requested' },
  approve_video: { kind: 'video', decision: 'approved' },
  request_video_changes: { kind: 'video', decision: 'changes_requested' },
};

/**
 * POST /api/v1/videos/:id/actions
 * Pipeline: { action: send_for_review | retry_failed | regenerate_scene | regenerate_avatar | re_render, scene_index? }
 * Review:   { action: approve_script | request_script_changes | approve_video | request_video_changes, comment?, reviewer_name? }
 */
export function POST(req: Request, { params }: Params) {
  return handleApi(async () => {
    const ctx = await requireApiKey(req, 'write');
    const { id } = await params;
    const body = (await req.json()) as {
      action: string;
      scene_index?: number;
      comment?: string;
      reviewer_name?: string;
    };

    const review = REVIEW_ACTIONS[body.action];
    if (review) {
      await applyReviewDecision(ctx.db, id, {
        ...review,
        comment: body.comment,
        reviewer_name: body.reviewer_name || `api:${ctx.keyName}`,
        review_link_id: null,
      });
      return { ok: true };
    }

    if (!PIPELINE_ACTIONS.includes(body.action as VideoActionName)) {
      throw new ApiError(400, `Unknown action: ${body.action}`);
    }
    await performVideoAction(ctx.db, id, {
      action: body.action as VideoActionName,
      scene_index: body.scene_index,
    });
    return { ok: true };
  });
}
