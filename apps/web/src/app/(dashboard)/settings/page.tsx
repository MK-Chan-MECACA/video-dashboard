import { DEFAULT_CAPTION_SYSTEM, DEFAULT_SCRIPT_SYSTEM, type BrandAssetKind } from '@vd/shared';
import { supabaseServer } from '@/lib/supabase';
import { SettingsClient, type BrandAssetRow } from '@/components/SettingsClient';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const supabase = await supabaseServer();
  const [{ data: brandAssets }, { data: settings }] = await Promise.all([
    supabase.from('brand_assets').select('*').order('created_at', { ascending: false }),
    supabase.from('app_settings').select('key, value'),
  ]);

  return (
    <SettingsClient
      brandAssets={(brandAssets ?? []).map((a) => ({
        id: a.id,
        kind: a.kind as BrandAssetKind,
        name: a.name,
        is_default: a.is_default,
        created_at: a.created_at,
      })) as BrandAssetRow[]}
      settings={Object.fromEntries((settings ?? []).map((r) => [r.key, r.value]))}
      defaultScriptPrompt={DEFAULT_SCRIPT_SYSTEM}
      defaultCaptionPrompt={DEFAULT_CAPTION_SYSTEM}
    />
  );
}
