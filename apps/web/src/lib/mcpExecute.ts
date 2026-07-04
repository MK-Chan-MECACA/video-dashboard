import type { SupabaseClient } from '@supabase/supabase-js';
import type { Script } from '@vd/shared';
import { ApiError } from '@/lib/apiAuth';
import { logEvent, saveScriptVersion } from '@/lib/scripts';
import { ghl, heygen, r2, wavespeed } from '@/lib/services';
import { getSettings, listBrandAssets, putSettings } from '@/lib/settingsService';
import {
  applyReviewDecision,
  createReviewLink,
  createVideo,
  deleteVideo,
  getVideoDetail,
  listVideos,
  performVideoAction,
  regenerateScript,
  updateVideo,
  type VideoActionName,
} from '@/lib/videos';

/**
 * In-process executor for the MCP tools defined in @vd/shared TOOL_DEFS.
 * Same service layer as /api/v1 — the stdio package reaches the identical
 * behavior through the REST API instead.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function executeTool(
  name: string,
  args: Record<string, any>,
  db: SupabaseClient,
  keyName: string,
): Promise<unknown> {
  switch (name) {
    case 'list_videos':
      return {
        videos: await listVideos(db, {
          status: args.status,
          limit: args.limit,
          offset: args.offset,
        }),
      };
    case 'get_video':
      return getVideoDetail(db, { id: args.video_id, presignAssets: true });
    case 'create_video':
      return createVideo(db, {
        title: args.title,
        topic_brief: args.topic_brief,
        generate: args.generate,
      });
    case 'update_video': {
      const { video_id, ...patch } = args;
      await updateVideo(db, video_id, patch);
      return { ok: true };
    }
    case 'delete_video':
      return { ok: true, ...(await deleteVideo(db, args.video_id)) };
    case 'save_script': {
      const script: Script = { hook: args.hook, scenes: args.scenes, cta: args.cta };
      const version = await saveScriptVersion(db, {
        videoId: args.video_id,
        script,
        createdBy: 'operator',
      });
      await logEvent(db, args.video_id, 'script_edited', { version: version.version, via: 'mcp' });
      return { version_id: version.id, version: version.version };
    }
    case 'regenerate_script': {
      const version = await regenerateScript(db, args.video_id, {
        instructions: args.instructions,
        fresh: args.fresh,
      });
      return { version_id: version.id, version: version.version, script: version };
    }
    case 'video_action':
      await performVideoAction(db, args.video_id, {
        action: args.action as VideoActionName,
        scene_index: args.scene_index,
      });
      return { ok: true };
    case 'review_decision':
      await applyReviewDecision(db, args.video_id, {
        kind: args.kind,
        decision: args.decision,
        comment: args.comment,
        reviewer_name: args.reviewer_name || `api:${keyName}`,
        review_link_id: null,
      });
      return { ok: true };
    case 'create_review_link':
      return createReviewLink(db, args.video_id, args.kind);
    case 'get_asset_url': {
      const { data: asset } = await db.from('assets').select('*').eq('id', args.asset_id).single();
      if (!asset) throw new ApiError(404, 'Asset not found');
      return { url: await r2().presignGet(asset.r2_key, 3600), expires_in: 3600, asset };
    }
    case 'list_brand_assets':
      return { brand_assets: await listBrandAssets(db, { presign: true }) };
    case 'get_settings': {
      if (args.picker === 'voices') {
        const voices = await heygen().listVoices();
        return {
          voices: voices.filter((v) => v.language?.toLowerCase().includes('english')).slice(0, 200),
        };
      }
      if (args.picker === 'scene_models') return { scene_models: await wavespeed().listSceneModels() };
      if (args.picker === 'ghl') return { accounts: await ghl().listAccounts() };
      return { settings: await getSettings(db) };
    }
    case 'update_settings':
      await putSettings(db, args.settings ?? {});
      return { ok: true };
    default:
      throw new ApiError(400, `Unknown tool: ${name}`);
  }
}
