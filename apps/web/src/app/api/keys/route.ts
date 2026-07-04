import { NextResponse } from 'next/server';
import { requireOperator } from '@/lib/supabase';
import { newApiKey } from '@/lib/tokens';

/** List API keys (metadata only — never the key itself). */
export async function GET() {
  let supabase;
  try {
    ({ supabase } = await requireOperator());
  } catch {
    return new NextResponse('Unauthorized', { status: 401 });
  }
  const { data, error } = await supabase
    .from('api_keys')
    .select('id, name, key_prefix, scopes, created_at, last_used_at, revoked_at')
    .order('created_at', { ascending: false });
  if (error) return new NextResponse(error.message, { status: 500 });
  return NextResponse.json(data ?? []);
}

/** Create a key. Body: { name, scopes? } — returns the full key exactly once. */
export async function POST(req: Request) {
  let supabase;
  try {
    ({ supabase } = await requireOperator());
  } catch {
    return new NextResponse('Unauthorized', { status: 401 });
  }
  const body = (await req.json()) as { name?: string; scopes?: string[] };
  if (!body.name?.trim()) return new NextResponse('Name is required', { status: 400 });

  const scopes = (body.scopes ?? ['read', 'write']).filter((s) => s === 'read' || s === 'write');
  if (scopes.length === 0) return new NextResponse('scopes must include read and/or write', { status: 400 });

  const { key, keyHash, keyPrefix } = newApiKey();
  const { data, error } = await supabase
    .from('api_keys')
    .insert({ name: body.name.trim(), key_hash: keyHash, key_prefix: keyPrefix, scopes })
    .select('id')
    .single();
  if (error) return new NextResponse(error.message, { status: 500 });

  return NextResponse.json({ id: data.id, key });
}
