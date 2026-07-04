import type { Script } from '@vd/shared';
import { ApiError, requireApiKey } from '@/lib/apiAuth';
import { handleApi } from '@/lib/apiResponse';
import { logEvent, saveScriptVersion } from '@/lib/scripts';

type Params = { params: Promise<{ id: string }> };

/** GET /api/v1/videos/:id/script — current version; ?versions=1 lists all. */
export function GET(req: Request, { params }: Params) {
  return handleApi(async () => {
    const ctx = await requireApiKey(req, 'read');
    const { id } = await params;
    const url = new URL(req.url);

    if (url.searchParams.get('versions')) {
      const { data, error } = await ctx.db
        .from('script_versions')
        .select('*')
        .eq('video_id', id)
        .order('version', { ascending: false });
      if (error) throw new ApiError(500, error.message);
      return { versions: data ?? [] };
    }

    const { data: video } = await ctx.db
      .from('videos')
      .select('current_script_version_id')
      .eq('id', id)
      .single();
    if (!video) throw new ApiError(404, 'Video not found');
    if (!video.current_script_version_id) return { script: null };

    const { data: script } = await ctx.db
      .from('script_versions')
      .select('*')
      .eq('id', video.current_script_version_id)
      .single();
    return { script };
  });
}

/** PUT /api/v1/videos/:id/script — save an edited script { hook, cta, scenes } as a new version. */
export function PUT(req: Request, { params }: Params) {
  return handleApi(async () => {
    const ctx = await requireApiKey(req, 'write');
    const { id } = await params;
    const script = (await req.json()) as Script;
    const version = await saveScriptVersion(ctx.db, {
      videoId: id,
      script,
      createdBy: 'operator',
    });
    await logEvent(ctx.db, id, 'script_edited', { version: version.version, via: 'api' });
    return { version_id: version.id, version: version.version };
  });
}
