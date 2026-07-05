import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireOperator, supabaseAdmin, roleOf } from '@/lib/supabase';
import { sessionError } from '@/lib/apiResponse';
import { ApiError } from '@/lib/apiAuth';
import { appUrl } from '@/lib/services';

type Params = { params: Promise<{ id: string }> };

/**
 * Email a fresh sign-in link to a client reviewer. Operator-triggered — reviewers
 * cannot request codes themselves; access is managed from Settings.
 *
 * Relies on the Supabase "Magic Link" email template linking to
 * {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email
 * (server-initiated OTP cannot complete the default PKCE link flow).
 */
export async function POST(_req: Request, { params }: Params) {
  const { id } = await params;
  try {
    await requireOperator();

    const { data, error } = await supabaseAdmin().auth.admin.getUserById(id);
    if (error || !data.user) throw new ApiError(404, 'User not found');
    if (roleOf(data.user) !== 'client') {
      throw new ApiError(400, 'Operators sign in with their password');
    }
    const email = data.user.email;
    if (!email) throw new ApiError(400, 'User has no email');

    // Anon client: signInWithOtp sends the magic-link email via Supabase's mailer.
    const anon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } },
    );
    const { error: sendError } = await anon.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: false, emailRedirectTo: `${appUrl()}/auth/confirm` },
    });
    if (sendError) throw new ApiError(400, sendError.message);

    return NextResponse.json({ ok: true });
  } catch (e) {
    return sessionError(e);
  }
}
