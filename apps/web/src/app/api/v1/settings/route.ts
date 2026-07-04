import { requireApiKey } from '@/lib/apiAuth';
import { handleApi } from '@/lib/apiResponse';
import { ghl, heygen, wavespeed } from '@/lib/services';
import { getSettings, putSettings } from '@/lib/settingsService';

/** GET /api/v1/settings — saved settings; ?voices=1 | ?scene_models=1 | ?ghl=1 for pickers. */
export function GET(req: Request) {
  return handleApi(async () => {
    const ctx = await requireApiKey(req, 'read');
    const url = new URL(req.url);

    if (url.searchParams.get('voices')) {
      const voices = await heygen().listVoices();
      return {
        voices: voices.filter((v) => v.language?.toLowerCase().includes('english')).slice(0, 200),
      };
    }
    if (url.searchParams.get('scene_models')) {
      return { scene_models: await wavespeed().listSceneModels() };
    }
    if (url.searchParams.get('ghl')) {
      return { accounts: await ghl().listAccounts() };
    }
    return { settings: await getSettings(ctx.db) };
  });
}

/** PUT /api/v1/settings — upsert { key: value, ... } */
export function PUT(req: Request) {
  return handleApi(async () => {
    const ctx = await requireApiKey(req, 'write');
    const body = (await req.json()) as Record<string, unknown>;
    await putSettings(ctx.db, body);
    return { ok: true };
  });
}
