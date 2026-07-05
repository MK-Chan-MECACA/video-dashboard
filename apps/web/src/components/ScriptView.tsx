import { sceneCode, type ScriptScene } from '@vd/shared';

/**
 * Narrator-bubble scripts store the whole voiceover as one passage (in `hook`)
 * and use scenes only for B-roll prompts — no per-scene spoken lines.
 */
export function isNarratorScript(scenes: { voiceover: string }[]): boolean {
  return scenes.length > 0 && scenes.every((s) => !s.voiceover.trim());
}

export function ScriptView({
  hook,
  cta,
  scenes,
  videoNo,
}: {
  hook: string;
  cta: string;
  scenes: ScriptScene[];
  videoNo?: number | null;
}) {
  const box = 'rounded-[11px] border border-studio-border-strong bg-studio-card px-4 py-3';

  if (isNarratorScript(scenes)) {
    const passage = [hook, cta].map((t) => t.trim()).filter(Boolean).join(' ');
    return (
      <div className="space-y-2.5 text-sm">
        <div className={box}>
          <p className="studio-eyebrow mb-1.5">
            Voiceover
          </p>
          <p className="leading-relaxed text-[#e6ddca]">{passage}</p>
        </div>
        {scenes.map((s) => (
          <div key={s.index} className={box}>
            <p className="studio-eyebrow mb-1.5">
              {sceneCode(videoNo, s.index)} — B-roll
            </p>
            <p className="leading-relaxed text-studio-sub">{s.broll_prompt}</p>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2.5 text-sm">
      <div className={box}>
        <p className="studio-eyebrow mb-1.5">Hook</p>
        <p className="leading-relaxed text-[#e6ddca]">{hook}</p>
      </div>
      {scenes.map((s) => (
        <div key={s.index} className={box}>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <p className="studio-eyebrow">{sceneCode(videoNo, s.index)} · voiceover</p>
            {s.model_path && (
              <span className="font-mono text-[10px] text-studio-muted">
                {s.model_path
                  .split('/')
                  .filter((p) => p !== 'text-to-video' && p !== 'image-to-video')
                  .at(-1)}
              </span>
            )}
          </div>
          <p className="leading-relaxed text-[#e6ddca]">{s.voiceover}</p>
          {s.broll_prompt && (
            <p className="mt-2 text-xs text-studio-muted">B-roll: {s.broll_prompt}</p>
          )}
        </div>
      ))}
      <div className={box}>
        <p className="studio-eyebrow mb-1.5">Call to action</p>
        <p className="leading-relaxed text-[#e6ddca]">{cta}</p>
      </div>
    </div>
  );
}
