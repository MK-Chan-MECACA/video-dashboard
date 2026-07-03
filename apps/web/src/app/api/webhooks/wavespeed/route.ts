import { NextResponse } from 'next/server';
import { verifyWaveSpeedWebhook } from '@vd/shared';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * WaveSpeed prediction webhook. Verifies the HMAC signature, then writes the
 * result onto the matching job row. The worker (single writer of pipeline
 * state) finalizes: downloads outputs to R2 and advances the video status.
 */
export async function POST(req: Request) {
  const body = await req.text();
  const webhookId = req.headers.get('webhook-id') ?? '';
  const timestamp = req.headers.get('webhook-timestamp') ?? '';
  const signature = req.headers.get('webhook-signature') ?? '';

  const secret = process.env.WAVESPEED_WEBHOOK_SECRET;
  if (secret) {
    const ok = await verifyWaveSpeedWebhook({
      secret,
      webhookId,
      timestamp,
      signatureHeader: signature,
      body,
    });
    if (!ok) return new NextResponse('Invalid signature', { status: 401 });
  }

  let payload: { id?: string; status?: string; outputs?: string[]; error?: string };
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    payload = (parsed.data ?? parsed) as typeof payload;
  } catch {
    return new NextResponse('Invalid JSON', { status: 400 });
  }
  if (!payload.id) return new NextResponse('Missing prediction id', { status: 400 });

  const db = supabaseAdmin();
  const { error } = await db
    .from('jobs')
    .update({
      external_status: payload.status ?? null,
      external_output: payload,
    })
    .eq('external_id', payload.id)
    .eq('status', 'awaiting_external');
  if (error) return new NextResponse(error.message, { status: 500 });

  return NextResponse.json({ ok: true });
}
