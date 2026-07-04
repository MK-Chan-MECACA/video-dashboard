import { NextResponse } from 'next/server';
import { requireOperator } from '@/lib/supabase';
import { sessionError } from '@/lib/apiResponse';
import { generateVideoFromDirection } from '@/lib/videos';

export const maxDuration = 120;

export async function POST(req: Request) {
  let supabase;
  try {
    ({ supabase } = await requireOperator());
  } catch {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  const body = (await req.json()) as {
    tone?: string;
    style?: string;
    constraints?: string;
    flow?: string;
  };

  try {
    const { video } = await generateVideoFromDirection(supabase, body);
    return NextResponse.json({ id: video.id, video_no: video.video_no, title: video.title });
  } catch (e) {
    return sessionError(e);
  }
}
