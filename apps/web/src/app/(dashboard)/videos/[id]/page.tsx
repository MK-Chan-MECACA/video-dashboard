import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  SPOKEN_WORDS_PER_SECOND,
  resolveTargetDurationS,
  wordBudgetForDuration,
  type Asset,
  type Job,
  type ScriptVersion,
  type Video,
} from '@vd/shared';
import { estimateVideoCost, formatUsd } from '@vd/shared/pricing';
import { supabaseServer, roleOf } from '@/lib/supabase';
import { LocalTime, LocalTimeTitle } from '@/components/LocalTime';
import { ScriptView } from '@/components/ScriptView';
import { StatusBadge } from '@/components/StatusBadge';
import { DeleteVideoButton, VideoNumberBadge } from '@/components/VideoAdmin';
import { VideoActions } from '@/components/VideoActions';
import { ReviewClient } from '@/components/ReviewClient';

export const dynamic = 'force-dynamic';

export default async function VideoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await supabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isOperator = user ? roleOf(user) === 'operator' : true;

  const [{ data: video }, { data: assets }, { data: jobs }, { data: links }, { data: events }, { data: comments }, { data: approvals }, { data: targetSetting }] =
    await Promise.all([
      supabase.from('videos').select('*').eq('id', id).single(),
      supabase.from('assets').select('*').eq('video_id', id).order('created_at'),
      supabase.from('jobs').select('*').eq('video_id', id).order('created_at'),
      supabase.from('review_links').select('*').eq('video_id', id).order('created_at', { ascending: false }),
      supabase.from('pipeline_events').select('*').eq('video_id', id).order('created_at', { ascending: false }).limit(30),
      supabase.from('review_comments').select('*').eq('video_id', id).order('created_at', { ascending: false }),
      supabase.from('approvals').select('*').eq('video_id', id).order('created_at', { ascending: false }),
      supabase.from('app_settings').select('value').eq('key', 'target_duration_s').maybeSingle(),
    ]);

  if (!video) notFound();
  const v = video as Video;
  const assetList = (assets ?? []) as Asset[];

  let script: ScriptVersion | null = null;
  if (v.current_script_version_id) {
    const { data } = await supabase
      .from('script_versions')
      .select('*')
      .eq('id', v.current_script_version_id)
      .single();
    script = data as ScriptVersion | null;
  }

  const latestByKind = (kind: string, sceneIndex?: number) =>
    assetList
      .filter((a) => a.kind === kind && (sceneIndex === undefined || a.scene_index === sceneIndex))
      .at(-1);

  const cost = estimateVideoCost(assetList, (jobs ?? []) as Job[]);

  const voiceover = latestByKind('voiceover');
  const avatar = latestByKind('avatar_video');
  const finalVideo = latestByKind('final_video');
  const scenes = [1, 2, 3].map((i) => ({ i, asset: latestByKind('scene_clip', i) }));

  const spokenWords = script
    ? (script.full_voiceover_text ||
        [script.hook, ...script.scenes.map((s) => s.voiceover), script.cta].join(' '))
        .trim()
        .split(/\s+/)
        .filter(Boolean).length
    : 0;
  const targetDurationS = resolveTargetDurationS(targetSetting?.value);
  const scriptOverTarget = spokenWords > Math.ceil(wordBudgetForDuration(targetDurationS) * 1.1);

  const hatch =
    'repeating-linear-gradient(135deg,#221d14,#221d14 6px,#1a160f 6px,#1a160f 12px)';

  // Client reviewers get the review panel in place of the operator sections.
  const clientReviewKind: 'script' | 'video' | null = !isOperator
    ? v.status === 'script_review'
      ? 'script'
      : v.status === 'video_review'
        ? 'video'
        : null
    : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/"
          className="rounded-[8px] border border-studio-border-strong px-2.5 py-1.5 text-[13px] text-studio-sub transition-colors hover:bg-[#201d18] hover:text-studio-bright"
        >
          ← Pipeline
        </Link>
        {v.video_no && <VideoNumberBadge videoId={v.id} videoNo={v.video_no} />}
        <h1 className="text-[19px] font-semibold text-studio-bright">{v.title}</h1>
        <StatusBadge status={v.status} />
        {isOperator && (
          <Link
            href={`/videos/${v.id}/script`}
            className="ml-auto rounded-[8px] border border-studio-border-strong px-3.5 py-2 text-[12.5px] text-[#d8cfbf] transition-colors hover:bg-[#201d18] hover:text-studio-bright"
          >
            Open script editor →
          </Link>
        )}
      </div>

      {v.status === 'failed' && v.status_error && (
        <div className="rounded-[8px] border border-red-800 bg-red-950 p-3 text-sm text-red-200">
          <b>Pipeline failed:</b> {v.status_error}
        </div>
      )}

      <div className="grid items-start gap-[22px] lg:grid-cols-[1.9fr_1fr]">
        <div className="min-w-0 space-y-[18px]">
          {clientReviewKind && (
            <section className="rounded-[14px] border border-[#3a2f16] bg-studio-panel p-5">
              <ReviewClient
                endpoints={{
                  decision: `/api/videos/${v.id}/review/decision`,
                  comment: `/api/videos/${v.id}/review/comment`,
                }}
                kind={clientReviewKind}
                videoTitle={v.title}
                videoNo={v.video_no}
                awaiting
                lastDecision={null}
                reviewerName={user?.email ?? 'Reviewer'}
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
                mediaUrl={finalVideo ? `/api/media/${finalVideo.id}` : null}
              />
            </section>
          )}

          {!clientReviewKind && script && (
            <section className="rounded-[14px] border border-studio-border bg-studio-panel p-5">
              <div className="mb-3.5 flex flex-wrap items-center gap-2.5">
                <h2 className="text-sm font-semibold text-studio-bright">
                  Script v{script.version}
                </h2>
                <span className="text-xs text-studio-muted">
                  · v{script.version} ({script.created_by}) · {spokenWords} words spoken · ~
                  {Math.round(spokenWords / SPOKEN_WORDS_PER_SECOND)}s
                </span>
                {scriptOverTarget && (
                  <span className="text-xs text-red-400">
                    ⚠ over the {targetDurationS}s target — regenerate or trim before approving
                  </span>
                )}
              </div>
              <ScriptView
                hook={script.hook}
                cta={script.cta}
                scenes={script.scenes}
                videoNo={v.video_no}
              />
            </section>
          )}

          {!clientReviewKind && (
          <section className="rounded-[14px] border border-studio-border bg-studio-panel p-5">
            <h2 className="mb-3.5 text-sm font-semibold text-[#d8cfbf]">Generated assets</h2>
            <div className="mb-3.5">
              <p className="mb-1.5 text-[11px] text-studio-muted">
                Voiceover · HeyGen TTS
                {voiceover?.duration_s ? ` · ${Math.round(voiceover.duration_s)}s` : ''}
              </p>
              {voiceover ? (
                <div className="rounded-[9px] border border-studio-border bg-studio-card p-2">
                  <audio controls preload="metadata" src={`/api/media/${voiceover.id}`} className="w-full" />
                </div>
              ) : (
                <div className="rounded-[9px] border border-studio-border bg-studio-card px-3 py-2.5 text-xs text-studio-faint">
                  Not generated yet
                </div>
              )}
            </div>
            <div className="mb-3.5 grid grid-cols-2 gap-2.5 md:grid-cols-4">
              {[{ label: 'Avatar', asset: avatar }, ...scenes.map(({ i, asset }) => ({ label: `Scene ${i}`, asset }))].map(
                ({ label, asset }) => (
                  <div key={label}>
                    <p className="mb-1.5 text-[11px] text-studio-muted">{label}</p>
                    {asset ? (
                      <video
                        controls
                        preload="metadata"
                        src={`/api/media/${asset.id}#t=0.1`}
                        className="aspect-[9/16] w-full rounded-[9px] border border-studio-border bg-black object-cover"
                      />
                    ) : (
                      <div
                        className="flex aspect-[9/16] w-full items-center justify-center rounded-[9px] border border-studio-border text-base text-studio-accent"
                        style={{ background: hatch }}
                      >
                        ▶
                      </div>
                    )}
                  </div>
                ),
              )}
            </div>
            <div>
              <p className="mb-1.5 text-[11px] text-studio-muted">Final video · 1080×1920 render</p>
              {finalVideo ? (
                <video
                  controls
                  preload="metadata"
                  src={`/api/media/${finalVideo.id}#t=0.1`}
                  className="aspect-[9/16] w-full max-w-[320px] rounded-[11px] border border-[#3a2f16] bg-black object-cover"
                />
              ) : (
                <div
                  className="flex aspect-[9/16] w-full max-w-[320px] items-center justify-center rounded-[11px] border border-[#3a2f16] text-[26px] text-studio-accent"
                  style={{ background: hatch }}
                >
                  ▶
                </div>
              )}
            </div>
          </section>
          )}

          {isOperator && (
            <VideoActions
              video={v}
              links={(links ?? []).map((l) => ({
                id: l.id,
                kind: l.kind,
                revoked: l.revoked,
                expires_at: l.expires_at,
                created_at: l.created_at,
              }))}
            />
          )}

          {isOperator && (
            <section className="rounded-[14px] border border-studio-border bg-studio-panel p-5">
              <h2 className="mb-2.5 text-sm font-semibold text-[#d8cfbf]">Danger zone</h2>
              <DeleteVideoButton videoId={v.id} videoNo={v.video_no} title={v.title} />
              <p className="mt-2 text-[11px] text-studio-faint">
                Deletes the video and every asset. Blocked while the pipeline is actively
                processing.
              </p>
            </section>
          )}
        </div>

        <div className="space-y-4">
          {isOperator && cost.lines.length > 0 && (
            <section className="rounded-[14px] border border-studio-border bg-studio-panel p-5">
              <h2 className="mb-2.5 flex items-center justify-between text-[13px] font-semibold text-[#d8cfbf]">
                Cost
                <span className="font-mono text-sm font-normal text-studio-accent">
                  {formatUsd(cost.totalUsd, cost.approx)}
                </span>
              </h2>
              <ul className="space-y-[7px] text-xs">
                {cost.lines.map((l, idx) => (
                  <li key={idx} className="flex justify-between gap-2 text-studio-sub">
                    <span>{l.label}</span>
                    <span className="font-mono">{formatUsd(l.usd, l.approx)}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[10px] text-studio-faint">
                Estimated from generated durations at current provider rates; every
                submitted generation counts, including re-generations.
              </p>
            </section>
          )}

          {isOperator && (
          <section className="rounded-[14px] border border-studio-border bg-studio-panel p-5">
            <h2 className="mb-2.5 text-[13px] font-semibold text-[#d8cfbf]">Jobs</h2>
            <ul className="space-y-[7px] text-xs">
              {(jobs ?? []).map((j) => (
                <li key={j.id} className="flex justify-between gap-2">
                  <span className="font-mono text-studio-sub">
                    {j.type}
                    {j.payload?.scene_index ? ` #${j.payload.scene_index}` : ''}
                  </span>
                  <span
                    className={
                      j.status === 'failed'
                        ? 'text-red-400'
                        : j.status === 'succeeded'
                          ? 'text-emerald-400'
                          : 'text-studio-sub'
                    }
                  >
                    {j.status}
                  </span>
                </li>
              ))}
              {(jobs ?? []).length === 0 && <li className="text-studio-faint">No jobs yet</li>}
            </ul>
          </section>
          )}

          {(comments ?? []).length > 0 && (
            <section className="rounded-[14px] border border-studio-border bg-studio-panel p-5">
              <h2 className="mb-2.5 text-[13px] font-semibold text-[#d8cfbf]">
                Reviewer comments
              </h2>
              <ul className="space-y-[9px] text-xs">
                {(comments ?? []).map((c) => (
                  <li key={c.id} className="rounded-[9px] bg-studio-card px-3 py-2 leading-relaxed">
                    <span className="font-mono text-[11px] text-studio-accent">
                      [{c.section_key}]
                    </span>{' '}
                    <b className="text-[#d8cfbf]">{c.author_name}:</b>{' '}
                    <span className="text-[#cfc7b8]">{c.body}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {((approvals ?? []).length > 0 ||
            v.status === 'script_review' ||
            v.status === 'video_review') && (
            <section className="rounded-[14px] border border-studio-border bg-studio-panel p-5">
              <h2 className="mb-2.5 text-[13px] font-semibold text-[#d8cfbf]">Approvals</h2>
              <ul className="space-y-2 text-xs">
                {(approvals ?? []).map((a) => (
                  <LocalTimeTitle
                    key={a.id}
                    as="li"
                    iso={a.created_at}
                    className="flex items-center gap-2"
                  >
                    <span
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] ${
                        a.decision === 'approved'
                          ? 'bg-[#63d2a4] text-[#06251a]'
                          : 'bg-[#f0846a] text-[#2a120c]'
                      }`}
                    >
                      {a.decision === 'approved' ? '✓' : '✗'}
                    </span>
                    <span className="text-[#cfc7b8]">
                      {a.kind} — <b className="text-studio-text">{a.decision}</b> by{' '}
                      {a.reviewer_name}
                    </span>
                  </LocalTimeTitle>
                ))}
                {(v.status === 'script_review' || v.status === 'video_review') && (
                  <li className="flex items-center gap-2">
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-studio-accent text-[10px] text-studio-on-accent">
                      ◷
                    </span>
                    <span className="text-[#cfc7b8]">
                      {v.status === 'script_review' ? 'script' : 'video'} — awaiting decision
                    </span>
                  </li>
                )}
              </ul>
            </section>
          )}

          <section className="rounded-[14px] border border-studio-border bg-studio-panel p-5">
            <h2 className="mb-2.5 text-[13px] font-semibold text-[#d8cfbf]">Timeline</h2>
            <ul className="space-y-[9px] text-xs text-studio-sub">
              {(events ?? []).map((e) => (
                <LocalTimeTitle key={e.id} as="li" iso={e.created_at} className="flex gap-2.5">
                  <LocalTime
                    iso={e.created_at}
                    className="whitespace-nowrap font-mono text-[#6f6a60]"
                  />
                  <span>{String(e.event).replaceAll('_', ' ')}</span>
                </LocalTimeTitle>
              ))}
              {(events ?? []).length === 0 && (
                <li className="text-studio-faint">No events yet</li>
              )}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
