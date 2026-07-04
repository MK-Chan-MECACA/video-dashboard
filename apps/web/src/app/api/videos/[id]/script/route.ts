import { NextResponse } from 'next/server';
import type { Script } from '@vd/shared';
import { requireOperator } from '@/lib/supabase';
import { sessionError } from '@/lib/apiResponse';
import { logEvent, saveScriptVersion } from '@/lib/scripts';
import { regenerateScript } from '@/lib/videos';

export const maxDuration = 120;

type Params = { params: Promise<{ id: string }> };

/** Save an operator-edited script as a new version. */
export async function PUT(req: Request, { params }: Params) {
  let supabase;
  try {
    ({ supabase } = await requireOperator());
  } catch {
    return new NextResponse('Unauthorized', { status: 401 });
  }
  const { id } = await params;
  const script = (await req.json()) as Script;

  try {
    const version = await saveScriptVersion(supabase, {
      videoId: id,
      script,
      createdBy: 'operator',
    });
    await logEvent(supabase, id, 'script_edited', { version: version.version });
    return NextResponse.json({ version_id: version.id });
  } catch (e) {
    return new NextResponse(String(e), { status: 500 });
  }
}

/** Regenerate with Claude (optionally revising the current version with instructions). */
export async function POST(req: Request, { params }: Params) {
  let supabase;
  try {
    ({ supabase } = await requireOperator());
  } catch {
    return new NextResponse('Unauthorized', { status: 401 });
  }
  const { id } = await params;
  const body = (await req.json()) as { instructions?: string; fresh?: boolean };

  try {
    const version = await regenerateScript(supabase, id, body);
    return NextResponse.json({ version_id: version.id });
  } catch (e) {
    return sessionError(e);
  }
}
