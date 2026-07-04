import type { SupabaseClient } from '@supabase/supabase-js';
import type { BrandAssetKind } from '@vd/shared';
import { ApiError } from '@/lib/apiAuth';
import { r2 } from '@/lib/services';

/** Settings + brand-asset service layer, shared by session routes and /api/v1. */

export async function getSettings(db: SupabaseClient): Promise<Record<string, unknown>> {
  const { data } = await db.from('app_settings').select('key, value');
  return Object.fromEntries((data ?? []).map((r) => [r.key, r.value]));
}

export async function putSettings(db: SupabaseClient, body: Record<string, unknown>): Promise<void> {
  for (const [key, value] of Object.entries(body)) {
    const { error } = await db
      .from('app_settings')
      .upsert({ key, value, updated_at: new Date().toISOString() });
    if (error) throw new ApiError(500, error.message);
  }
}

const CONTENT_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
};

export async function listBrandAssets(
  db: SupabaseClient,
  opts: { presign?: boolean } = {},
): Promise<Record<string, unknown>[]> {
  const { data, error } = await db
    .from('brand_assets')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw new ApiError(500, error.message);
  const rows = data ?? [];
  if (!opts.presign || !rows.length) return rows;
  const client = r2();
  return Promise.all(
    rows.map(async (a) => ({
      ...a,
      download_url: a.r2_key ? await client.presignGet(a.r2_key, 3600) : undefined,
    })),
  );
}

/** Step 1 of a brand-asset upload: presigned PUT for a direct upload. */
export async function presignBrandAssetUpload(opts: {
  kind: BrandAssetKind;
  filename: string;
}): Promise<{ uploadUrl: string; key: string; contentType: string }> {
  const ext = opts.filename.split('.').pop()?.toLowerCase() ?? 'bin';
  const contentType = CONTENT_TYPES[ext] ?? 'application/octet-stream';
  const key = `brand/${opts.kind}/${Date.now()}-${opts.filename.replace(/[^\w.-]/g, '_')}`;
  const uploadUrl = await r2().presignPut(key, contentType);
  return { uploadUrl, key, contentType };
}

/** Step 2: confirm the upload and create the DB record. */
export async function confirmBrandAsset(
  db: SupabaseClient,
  opts: { kind: BrandAssetKind; key: string; name: string; is_default?: boolean },
): Promise<Record<string, unknown>> {
  if (!opts.key || !opts.name) throw new ApiError(400, 'key and name required');
  if (opts.is_default) {
    await db.from('brand_assets').update({ is_default: false }).eq('kind', opts.kind);
  }
  const { data, error } = await db
    .from('brand_assets')
    .insert({
      kind: opts.kind,
      name: opts.name,
      r2_key: opts.key,
      is_default: opts.is_default ?? false,
    })
    .select()
    .single();
  if (error) throw new ApiError(500, error.message);
  return data;
}

export async function deleteBrandAsset(db: SupabaseClient, id: string): Promise<void> {
  const { error } = await db.from('brand_assets').delete().eq('id', id);
  if (error) throw new ApiError(500, error.message);
}
