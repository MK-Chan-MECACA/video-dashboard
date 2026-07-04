import { NextResponse } from 'next/server';
import { requireOperator } from '@/lib/supabase';
import { sessionError } from '@/lib/apiResponse';
import { createVideo } from '@/lib/videos';

export const maxDuration = 120;

export async function POST(req: Request) {
  let supabase;
  try {
    ({ supabase } = await requireOperator());
  } catch {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const body = (await req.json()) as {
    title: string;
    topic_brief?: string;
    generate?: boolean;
  };

  try {
    const { video } = await createVideo(supabase, body);
    return NextResponse.json({ id: video.id });
  } catch (e) {
    return sessionError(e);
  }
}
