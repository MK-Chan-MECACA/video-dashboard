import { NextResponse } from 'next/server';
import { ApiError } from '@/lib/apiAuth';

/** v1 API route wrapper: run fn, return JSON, map ApiError → { error } with its status. */
export async function handleApi(fn: () => Promise<unknown>): Promise<NextResponse> {
  try {
    const result = await fn();
    return NextResponse.json(result ?? { ok: true });
  } catch (e) {
    if (e instanceof ApiError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

/** Session (operator UI) routes keep their original plain-text error bodies. */
export function sessionError(e: unknown): NextResponse {
  if (e instanceof ApiError) return new NextResponse(e.message, { status: e.status });
  return new NextResponse(String(e), { status: 500 });
}
