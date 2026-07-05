import { NextResponse } from 'next/server';
import { requireOperator, supabaseAdmin, roleOf } from '@/lib/supabase';
import { sessionError } from '@/lib/apiResponse';
import { ApiError } from '@/lib/apiAuth';

type Params = { params: Promise<{ id: string }> };

/** Revoke a client reviewer's access. Operators cannot be deleted from here. */
export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params;
  try {
    const { user: me } = await requireOperator();
    if (id === me.id) throw new ApiError(400, 'You cannot remove yourself');

    const admin = supabaseAdmin();
    const { data, error } = await admin.auth.admin.getUserById(id);
    if (error || !data.user) throw new ApiError(404, 'User not found');
    if (roleOf(data.user) !== 'client') {
      throw new ApiError(400, 'Operators can only be removed in the Supabase dashboard');
    }

    const { error: deleteError } = await admin.auth.admin.deleteUser(id);
    if (deleteError) throw new ApiError(500, deleteError.message);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return sessionError(e);
  }
}
