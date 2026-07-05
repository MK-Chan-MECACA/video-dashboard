import { NextResponse } from 'next/server';
import { requireOperator, supabaseAdmin } from '@/lib/supabase';
import { sessionError } from '@/lib/apiResponse';
import { ApiError } from '@/lib/apiAuth';
import { appUrl } from '@/lib/services';
import { listDashboardUsers } from '@/lib/users';

export async function GET() {
  try {
    await requireOperator();
    return NextResponse.json({ users: await listDashboardUsers() });
  } catch (e) {
    return sessionError(e);
  }
}

/** Invite a client reviewer. Body: { email } — role is set before their first login. */
export async function POST(req: Request) {
  try {
    await requireOperator();
    const { email } = (await req.json()) as { email?: string };
    const normalized = email?.trim().toLowerCase();
    if (!normalized || !normalized.includes('@')) throw new ApiError(400, 'Valid email required');

    const admin = supabaseAdmin();
    const { data, error } = await admin.auth.admin.inviteUserByEmail(normalized, {
      redirectTo: `${appUrl()}/auth/confirm`,
    });
    if (error) throw new ApiError(400, error.message);

    const { error: roleError } = await admin.auth.admin.updateUserById(data.user.id, {
      app_metadata: { role: 'client' },
    });
    if (roleError) {
      // Never leave an invited user without an explicit role.
      await admin.auth.admin.deleteUser(data.user.id);
      throw new ApiError(500, `Could not set client role: ${roleError.message}`);
    }
    return NextResponse.json({ ok: true, id: data.user.id });
  } catch (e) {
    return sessionError(e);
  }
}
