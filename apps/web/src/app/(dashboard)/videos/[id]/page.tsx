import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Asset, Job, ScriptVersion, Video } from '@vd/shared';
import { estimateVideoCost, formatUsd } from '@vd/shared/pricing';
import { supabaseServer } from '@/lib/supabase';
import { ScriptView } from '@/components/ScriptView';
import { StatusBadge } from '@/components/StatusBadge';
import { DeleteVideoButton, VideoNumberBadge } from '@/components/VideoAdmin';
import { VideoActions } from '@/components/VideoActions';

export const dynamic = 'force-dynamic';

export default async function VideoDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await supabaseServer();

  const [{ data: video }, { data: assets }, { data: jobs }, { data: links }, { data: events }, { data: comments }, { data: approvals }] =
    await Promise.all([
      supabase.from('videos').select('*').eq('id', id).single(),
      supabase.from('assets').select('*').eq('video_id', id).order('created_at'),
      supabase.from('jobs').select('*').eq('video_id', id).order('created_at'),
      supabase.from('review_links').select('*').eq('video_id', id).order('created_at', { ascending: false }),
      supabase.from('pipeline_events').select('*').eq('video_id', id).order('created_at', { ascending: false }).limit(30),
      supabase.from('review_comments').select('*').eq('video_id', id).order('created_at', { ascending: false }),
      supabase.from('approvals').select('*').eq('video_id', id).order('created_at', { ascending: false }),
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
  const scenes = [1, 2, 3]
    .map((i) => ({ i, asset: latestByKind('scene_clip', i) }))
    .filter((s) => s.asset);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        {v.video_no && <VideoNumberBadge videoId={v.id} videoNo={v.video_no} />}
        <h1 className="text-xl font-semibold">{v.title}</h1>
        <StatusBadge status={v.status} />
        <Link
          href={`/videos/${v.id}/script`}
          className="ml-auto rounded border border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-800"
        >
          Open script editor
        </Link>
      </div>

      {v.status === 'failed' && v.status_error && (
        <div className="rounded border border-red-800 bg-red-950 p-3 text-sm text-red-200">
          <b>Pipeline failed:</b> {v.status_error}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {script && (
            <section className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
              <h2 className="mb-2 text-sm font-semibold text-neutral-300">
                Script v{script.version}
              </h2>
              <ScriptView
                hook={script.hook}
                cta={script.cta}
                scenes={script.scenes}
                videoNo={v.video_no}
              />
            </section>
          )}

          <section className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
            <h2 className="mb-3 text-sm font-semibold text-neutral-300">Generated assets</h2>
            <div className="space-y-4">
              {voiceover && (
                <div>
                  <p className="mb-1 text-xs text-neutral-400">Voiceover</p>
                  <audio controls preload="metadata" src={`/api/media/${voiceover.id}`} className="w-full" />
                </div>
              )}
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                {avatar && (
                  <div>
                    <p className="mb-1 text-xs text-neutral-400">Avatar</p>
                    <video
                      controls
                      preload="metadata"
                      src={`/api/media/${avatar.id}#t=0.1`}
                      className="w-full rounded"
                    />
                  </div>
                )}
                {scenes.map(({ i, asset }) => (
                  <div key={i}>
                    <p className="mb-1 text-xs text-neutral-400">Scene {i}</p>
                    <video
                      controls
                      preload="metadata"
                      src={`/api/media/${asset!.id}#t=0.1`}
                      className="w-full rounded"
                    />
                  </div>
                ))}
              </div>
              {finalVideo && (
                <div>
                  <p className="mb-1 text-xs text-neutral-400">Final video</p>
                  <video
                    controls
                    preload="metadata"
                    src={`/api/media/${finalVideo.id}#t=0.1`}
                    className="mx-auto max-h-[480px] rounded"
                  />
                </div>
              )}
              {!voiceover && !avatar && scenes.length === 0 && !finalVideo && (
                <p className="text-sm text-neutral-500">
                  Nothing generated yet — assets appear here as the pipeline runs.
                </p>
              )}
            </div>
          </section>

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

          <section className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
            <h2 className="mb-2 text-sm font-semibold text-neutral-300">Danger zone</h2>
            <DeleteVideoButton videoId={v.id} videoNo={v.video_no} title={v.title} />
          </section>
        </div>

        <div className="space-y-6">
          {cost.lines.length > 0 && (
            <section className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
              <h2 className="mb-2 flex items-center justify-between text-sm font-semibold text-neutral-300">
                Cost
                <span className="font-mono text-yellow-400">
                  {formatUsd(cost.totalUsd, cost.approx)}
                </span>
              </h2>
              <ul className="space-y-1 text-xs">
                {cost.lines.map((l, idx) => (
                  <li key={idx} className="flex justify-between gap-2 text-neutral-400">
                    <span>{l.label}</span>
                    <span className="font-mono">{formatUsd(l.usd, l.approx)}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[10px] text-neutral-600">
                Estimated from generated durations at current provider rates; every
                submitted generation counts, including re-generations.
              </p>
            </section>
          )}

          <section className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
            <h2 className="mb-2 text-sm font-semibold text-neutral-300">Jobs</h2>
            <ul className="space-y-1 text-xs">
              {(jobs ?? []).map((j) => (
                <li key={j.id} className="flex justify-between gap-2">
                  <span>
                    {j.type}
                    {j.payload?.scene_index ? ` #${j.payload.scene_index}` : ''}
                  </span>
                  <span
                    className={
                      j.status === 'failed'
                        ? 'text-red-400'
                        : j.status === 'succeeded'
                          ? 'text-emerald-400'
                          : 'text-neutral-400'
                    }
                  >
                    {j.status}
                  </span>
                </li>
              ))}
              {(jobs ?? []).length === 0 && <li className="text-neutral-600">No jobs yet</li>}
            </ul>
          </section>

          {(comments ?? []).length > 0 && (
            <section className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
              <h2 className="mb-2 text-sm font-semibold text-neutral-300">Reviewer comments</h2>
              <ul className="space-y-2 text-xs">
                {(comments ?? []).map((c) => (
                  <li key={c.id} className="rounded bg-neutral-950 p-2">
                    <span className="text-yellow-400">[{c.section_key}]</span>{' '}
                    <b>{c.author_name}:</b> {c.body}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {(approvals ?? []).length > 0 && (
            <section className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
              <h2 className="mb-2 text-sm font-semibold text-neutral-300">Approvals</h2>
              <ul className="space-y-1 text-xs">
                {(approvals ?? []).map((a) => (
                  <li key={a.id}>
                    {a.kind} — <b>{a.decision}</b> by {a.reviewer_name} (
                    {new Date(a.created_at).toLocaleString()})
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
            <h2 className="mb-2 text-sm font-semibold text-neutral-300">Timeline</h2>
            <ul className="space-y-1 text-xs text-neutral-400">
              {(events ?? []).map((e) => (
                <li key={e.id}>
                  {new Date(e.created_at).toLocaleString()} — {e.event}
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
