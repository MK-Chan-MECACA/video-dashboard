import { requireApiKey } from '@/lib/apiAuth';
import { handleApi } from '@/lib/apiResponse';
import { regenerateScript } from '@/lib/videos';

export const maxDuration = 120;

type Params = { params: Promise<{ id: string }> };

/** POST /api/v1/videos/:id/script/regenerate — { instructions?, fresh? } (slow: calls Claude). */
export function POST(req: Request, { params }: Params) {
  return handleApi(async () => {
    const ctx = await requireApiKey(req, 'write');
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as { instructions?: string; fresh?: boolean };
    const version = await regenerateScript(ctx.db, id, body);
    return { version_id: version.id, version: version.version, script: version };
  });
}
