import { NextResponse, type NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { supabaseServer } from '@/lib/supabase';

/**
 * Verifies Supabase email links (invite / magic link) that land as
 * /auth/confirm?token_hash=…&type=… and starts a session via cookies.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;

  const redirectTo = request.nextUrl.clone();
  redirectTo.pathname = '/';
  redirectTo.search = '';

  if (token_hash && type) {
    const supabase = await supabaseServer();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) return NextResponse.redirect(redirectTo);
  }

  redirectTo.pathname = '/login';
  redirectTo.searchParams.set('error', 'invalid_link');
  return NextResponse.redirect(redirectTo);
}
