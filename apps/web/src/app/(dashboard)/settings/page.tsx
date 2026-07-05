import { DEFAULT_CAPTION_SYSTEM, DEFAULT_SCRIPT_SYSTEM, type BrandAssetKind } from '@vd/shared';
import { supabaseServer } from '@/lib/supabase';
import { r2 } from '@/lib/services';
import { SettingsClient, type BrandAssetRow } from '@/components/SettingsClient';
import { ApiKeysSection, type ApiKeyRow } from '@/components/ApiKeysSection';

export const dynamic = 'force-dynamic';

/** Presigned GET for an R2 key, or null when the key is missing or signing fails
 * (the client falls back to the authed media redirect route). */
async function presignQuiet(r2Key: string | null | undefined): Promise<string | null> {
  if (!r2Key) return null;
  try {
    return await r2().presignGet(r2Key);
  } catch {
    return null;
  }
}

export default async function SettingsPage() {
  const supabase = await supabaseServer();
  const [{ data: brandAssets }, { data: settings }, { data: apiKeys }] = await Promise.all([
    supabase.from('brand_assets').select('*').order('created_at', { ascending: false }),
    supabase.from('app_settings').select('key, value'),
    supabase
      .from('api_keys')
      .select('id, name, key_prefix, scopes, created_at, last_used_at, revoked_at')
      .order('created_at', { ascending: false }),
  ]);

  // Presign media URLs server-side so the layout preview loads straight from R2.
  // A <video> re-requests its src for metadata probes and seeks; routing those
  // through the authed /api/brand-assets/[id]/media redirect is fragile (any
  // transient 401/refresh race permanently blanks the preview media).
  const brandAssetRows = await Promise.all(
    (brandAssets ?? []).map(async (a) => ({
      id: a.id,
      kind: a.kind as BrandAssetKind,
      name: a.name,
      is_default: a.is_default,
      created_at: a.created_at,
      media_url: await presignQuiet(a.r2_key),
      // Worker-extracted poster frame (meta.poster_key) — the preview prefers
      // it because browsers can't always decode the raw reference video
      // (e.g. Safari has no 10-bit H.264 decoder).
      poster_url: await presignQuiet(
        (a.meta as Record<string, unknown> | null)?.poster_key as string | undefined,
      ),
    })),
  );

  return (
    <SettingsClient
      brandAssets={brandAssetRows as BrandAssetRow[]}
      settings={Object.fromEntries((settings ?? []).map((r) => [r.key, r.value]))}
      defaultScriptPrompt={DEFAULT_SCRIPT_SYSTEM}
      defaultCaptionPrompt={DEFAULT_CAPTION_SYSTEM}
    >
      <ApiKeysSection apiKeys={(apiKeys ?? []) as ApiKeyRow[]} />
    </SettingsClient>
  );
}
