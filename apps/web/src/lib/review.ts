import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase';
import { hashToken } from '@/lib/tokens';

export interface ReviewLinkRow {
  id: string;
  video_id: string;
  kind: 'script' | 'video';
  expires_at: string;
  revoked: boolean;
}

/**
 * Resolve a raw magic-link token to its review link, or null.
 * Uses the service role — the token itself is the credential.
 */
export async function resolveReviewToken(
  token: string,
): Promise<{ db: SupabaseClient; link: ReviewLinkRow } | null> {
  if (!token || token.length < 20) return null;
  const db = supabaseAdmin();
  const { data } = await db
    .from('review_links')
    .select('id, video_id, kind, expires_at, revoked')
    .eq('token_hash', hashToken(token))
    .maybeSingle();
  if (!data || data.revoked || new Date(data.expires_at) < new Date()) return null;
  return { db, link: data as ReviewLinkRow };
}

// Simple in-memory rate limit per token (best effort on serverless).
const hits = new Map<string, { count: number; reset: number }>();
export function rateLimit(token: string, max = 30, windowMs = 60_000): boolean {
  const now = Date.now();
  const h = hits.get(token);
  if (!h || h.reset < now) {
    hits.set(token, { count: 1, reset: now + windowMs });
    return true;
  }
  h.count += 1;
  return h.count <= max;
}
