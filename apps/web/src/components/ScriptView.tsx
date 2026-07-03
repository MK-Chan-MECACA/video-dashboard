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
  if (isNarratorScript(scenes)) {
    const passage = [hook, cta].map((t) => t.trim()).filter(Boolean).join(' ');
    return (
      <div className="space-y-3 text-sm">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-yellow-400">
            Voiceover
          </p>
          <p className="leading-relaxed">{passage}</p>
        </div>
        {scenes.map((s) => (
          <div key={s.index}>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-yellow-400">
              {sceneCode(videoNo, s.index)} — B-roll
            </p>
            <p className="leading-relaxed text-neutral-300">{s.broll_prompt}</p>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2 text-sm">
      <p>
        <b className="text-yellow-400">Hook:</b> {hook}
      </p>
      {scenes.map((s) => (
        <div key={s.index}>
          <p>
            <b className="text-yellow-400">{sceneCode(videoNo, s.index)}:</b> {s.voiceover}
          </p>
          {s.broll_prompt && (
            <p className="mt-0.5 text-xs text-neutral-500">B-roll: {s.broll_prompt}</p>
          )}
        </div>
      ))}
      <p>
        <b className="text-yellow-400">CTA:</b> {cta}
      </p>
    </div>
  );
}
