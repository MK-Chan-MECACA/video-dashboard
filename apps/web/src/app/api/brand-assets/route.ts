import { NextResponse } from 'next/server';
import { requireOperator } from '@/lib/supabase';
import type { BrandAssetKind } from '@vd/shared';
import { sessionError } from '@/lib/apiResponse';
import {
  confirmBrandAsset,
  deleteBrandAsset,
  presignBrandAssetUpload,
} from '@/lib/settingsService';

/** Step 1: get a presigned PUT for a direct browser upload. Body: { kind, filename } */
export async function POST(req: Request) {
  let supabase;
  try {
    ({ supabase } = await requireOperator());
  } catch {
    return new NextResponse('Unauthorized', { status: 401 });
  }
  const body = (await req.json()) as {
    kind: BrandAssetKind;
    filename: string;
    // Step 2 (after upload): confirm with key + name + is_default
    confirm?: boolean;
    key?: string;
    name?: string;
    is_default?: boolean;
  };

  try {
    if (body.confirm) {
      const asset = await confirmBrandAsset(supabase, {
        kind: body.kind,
        key: body.key ?? '',
        name: body.name ?? '',
        is_default: body.is_default,
      });
      return NextResponse.json(asset);
    }
    return NextResponse.json(
      await presignBrandAssetUpload({ kind: body.kind, filename: body.filename }),
    );
  } catch (e) {
    return sessionError(e);
  }
}

export async function DELETE(req: Request) {
  let supabase;
  try {
    ({ supabase } = await requireOperator());
  } catch {
    return new NextResponse('Unauthorized', { status: 401 });
  }
  const { id } = (await req.json()) as { id: string };
  try {
    await deleteBrandAsset(supabase, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return sessionError(e);
  }
}
