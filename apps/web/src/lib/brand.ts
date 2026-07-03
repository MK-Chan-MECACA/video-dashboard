import { supabaseAdmin } from '@/lib/supabase';

/** Brand name from app_settings (Settings → Brand), or null when unset. */
export async function getBrandName(): Promise<string | null> {
  try {
    const { data } = await supabaseAdmin()
      .from('app_settings')
      .select('value')
      .eq('key', 'brand_name')
      .maybeSingle();
    const v = data?.value;
    return typeof v === 'string' && v.trim() ? v.trim() : null;
  } catch {
    return null;
  }
}

/** Header-badge initials, e.g. "Acme Studio" → "AS". */
export function brandInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}
