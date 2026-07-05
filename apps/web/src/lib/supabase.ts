import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { ApiError } from '@/lib/apiAuth';

export type Role = 'operator' | 'client';

/** Missing claim = operator: the app is invite-only, so pre-role users are all operators. */
export function roleOf(user: User): Role {
  return user.app_metadata?.role === 'client' ? 'client' : 'operator';
}

/** Session-aware client for server components / route handlers (operator auth, RLS). */
export async function supabaseServer(): Promise<SupabaseClient> {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (
          cookiesToSet: { name: string; value: string; options: CookieOptions }[],
        ) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // called from a Server Component — middleware refreshes sessions
          }
        },
      },
    },
  );
}

/** Service-role client — bypasses RLS. Server-only: review routes, webhooks, job enqueueing. */
export function supabaseAdmin(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

/** Any logged-in user (operator or client). 401 when there is no session. */
export async function requireUser() {
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new ApiError(401, 'unauthorized');
  return { supabase, user, role: roleOf(user) };
}

/** Operator-only routes. 403 for client sessions. */
export async function requireOperator() {
  const ctx = await requireUser();
  if (ctx.role !== 'operator') throw new ApiError(403, 'forbidden');
  return ctx;
}
