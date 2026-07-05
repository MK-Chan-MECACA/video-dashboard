import type { Asset, ScriptVersion, Video } from '@vd/shared';
import { getBrandName } from '@/lib/brand';
import { resolveReviewToken } from '@/lib/review';
import { ReviewClient } from '@/components/ReviewClient';

export const dynamic = 'force-dynamic';

export default async function ReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const resolved = await resolveReviewToken(token);

  if (!resolved) {
    return (
      <div className="mx-auto mt-24 max-w-md rounded-[14px] border border-studio-border bg-studio-card p-6 text-center">
        <h1 className="text-lg font-semibold text-studio-bright">Link not valid</h1>
        <p className="mt-2 text-sm text-studio-sub">
          This review link has expired or been revoked. Please ask for a new one.
        </p>
      </div>
    );
  }

  const { db, link } = resolved;
  const { data: video } = await db.from('videos').select('*').eq('id', link.video_id).single();
  if (!video) return null;
  const v = video as Video;

  let script: ScriptVersion | null = null;
  if (v.current_script_version_id) {
    const { data } = await db
      .from('script_versions')
      .select('*')
      .eq('id', v.current_script_version_id)
      .single();
    script = data as ScriptVersion | null;
  }

  let finalAsset: Asset | null = null;
  if (link.kind === 'video') {
    const { data } = await db
      .from('assets')
      .select('*')
      .eq('video_id', link.video_id)
      .eq('kind', 'final_video')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    finalAsset = data as Asset | null;
  }

  const { data: decision } = await db
    .from('approvals')
    .select('decision, reviewer_name, created_at')
    .eq('video_id', link.video_id)
    .eq('kind', link.kind)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const awaiting =
    (link.kind === 'script' && v.status === 'script_review') ||
    (link.kind === 'video' && v.status === 'video_review');

  const brandName = await getBrandName();

  return (
    <ReviewClient
      token={token}
      brandName={brandName}
      kind={link.kind}
      videoTitle={v.title}
      videoNo={v.video_no}
      awaiting={awaiting}
      lastDecision={decision ?? null}
      script={
        script
          ? {
              hook: script.hook,
              cta: script.cta,
              scenes: script.scenes.map((s) => ({
                index: s.index,
                voiceover: s.voiceover,
                broll_prompt: s.broll_prompt,
              })),
              version: script.version,
            }
          : null
      }
      mediaUrl={finalAsset ? `/api/media/${finalAsset.id}?t=${encodeURIComponent(token)}` : null}
    />
  );
}
