import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabase';
import { hashToken } from '@/lib/tokens';

/** Error with an HTTP status — thrown by service functions and mapped by handleApi(). */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export type ApiScope = 'read' | 'write';

export interface ApiKeyContext {
  /** Service-role client — the API key is the credential (same trust model as review tokens). */
  db: SupabaseClient;
  keyId: string;
  keyName: string;
  scopes: string[];
}

/**
 * Resolve a raw bearer token to its API key context, or null.
 * Hashed lookup via the service role; shared by REST routes and the MCP endpoint.
 */
export async function verifyApiKeyToken(
  token: string,
  scope: ApiScope = 'read',
): Promise<ApiKeyContext | null> {
  if (!token || !token.startsWith('ttm_')) return null;
  const db = supabaseAdmin();
  const { data } = await db
    .from('api_keys')
    .select('id, name, scopes, revoked_at')
    .eq('key_hash', hashToken(token))
    .maybeSingle();
  if (!data || data.revoked_at) return null;

  const scopes = (data.scopes ?? []) as string[];
  if (!scopes.includes(scope)) {
    throw new ApiError(403, `This API key does not have the '${scope}' scope`);
  }

  // Fire-and-forget usage stamp — never block the request on it.
  void db.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', data.id);

  return { db, keyId: data.id, keyName: data.name, scopes };
}

/** Authenticate a v1 API request: Authorization: Bearer ttm_live_… */
export async function requireApiKey(req: Request, scope: ApiScope = 'read'): Promise<ApiKeyContext> {
  const auth = req.headers.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) throw new ApiError(401, 'Missing Authorization: Bearer <api key> header');

  const ctx = await verifyApiKeyToken(token, scope);
  if (!ctx) throw new ApiError(401, 'Invalid or revoked API key');

  if (!rateLimit(ctx.keyId)) throw new ApiError(429, 'Rate limit exceeded (120 requests/minute)');
  return ctx;
}

// Simple in-memory rate limit per key (best effort on serverless, like review links).
const hits = new Map<string, { count: number; reset: number }>();
function rateLimit(keyId: string, max = 120, windowMs = 60_000): boolean {
  const now = Date.now();
  const h = hits.get(keyId);
  if (!h || h.reset < now) {
    hits.set(keyId, { count: 1, reset: now + windowMs });
    return true;
  }
  h.count += 1;
  return h.count <= max;
}
