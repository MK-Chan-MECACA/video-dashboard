import { NextResponse } from 'next/server';
import { requireOperator } from '@/lib/supabase';

type Params = { params: Promise<{ id: string }> };

/** Revoke a key (soft — keeps the audit trail). */
export async function DELETE(req: Request, { params }: Params) {
  let supabase;
  try {
    ({ supabase } = await requireOperator());
  } catch {
    return new NextResponse('Unauthorized', { status: 401 });
  }
  const { id } = await params;
  const { error } = await supabase
    .from('api_keys')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id);
  if (error) return new NextResponse(error.message, { status: 500 });
  return NextResponse.json({ ok: true });
}
