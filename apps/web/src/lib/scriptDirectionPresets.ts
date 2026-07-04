/**
 * Creative-direction presets for the AI Script Generator dropdowns.
 *
 * The DEFAULTS below are deliberately industry-neutral so the open-source
 * dashboard works for any brand out of the box. Each deployment tailors its own
 * dropdown options by saving the `script_direction_presets` setting (Settings →
 * "AI Script Generator presets"); the built-in defaults are the fallback.
 *
 * Only the preset OPTIONS are operator-editable — the four field labels/hints
 * (the taxonomy) stay fixed in code so the UI shape is stable. The selected
 * preset's `prompt` string is what the API receives, so this file never touches
 * the API contract.
 */

export interface DirectionPreset {
  label: string;
  prompt: string;
}

export interface DirectionField {
  key: 'tone' | 'style' | 'constraints' | 'flow';
  label: string;
  hint: string;
  presets: DirectionPreset[];
}

export const DEFAULT_DIRECTION_FIELDS: DirectionField[] = [
  {
    key: 'tone',
    label: 'Tone — The Vibe',
    hint: 'How the presenter should sound',
    presets: [
      {
        label: 'Authoritative Expert',
        prompt:
          'Authoritative expert: confident, precise, speaks from years of hands-on experience; no hedging.',
      },
      {
        label: 'Friendly & Relatable',
        prompt:
          'Friendly and relatable: warm, conversational, like advice from a trusted friend who happens to be the expert.',
      },
      {
        label: 'Myth-busting / Contrarian',
        prompt:
          'Myth-busting and contrarian: challenge a common belief head-on; confident, a little provocative, backed by expertise.',
      },
      {
        label: 'Urgent Warning',
        prompt:
          'Urgent warning: serious and direct about a risk the viewer is ignoring; concerned, not fear-mongering.',
      },
      {
        label: 'Storytelling / Emotional',
        prompt:
          'Storytelling and emotional: human, empathetic, draws the viewer into a real-feeling moment before the payoff.',
      },
      {
        label: 'Light & Playful',
        prompt:
          'Light and playful: upbeat, a touch of humor, keeps it fun while the substance stays credible.',
      },
    ],
  },
  {
    key: 'style',
    label: 'Style — The Format & Structure',
    hint: 'The shape of the content',
    presets: [
      {
        label: 'Myth-bust',
        prompt: 'Myth-bust format: name a belief the audience holds, dismantle it, replace it with the truth.',
      },
      {
        label: 'Problem → Fix',
        prompt: 'Problem-to-fix format: open on a pain the viewer recognizes, explain why it persists, land the proper fix.',
      },
      {
        label: 'Listicle ("3 signs…")',
        prompt: 'Listicle format: a tight numbered list ("3 signs...", "3 mistakes...") with one list item per scene.',
      },
      {
        label: 'Educational ("Did you know")',
        prompt: 'Educational format: a surprising fact the audience does not know, unpacked simply, tied to what they should do about it.',
      },
      {
        label: 'Mini case story',
        prompt: 'Mini case story: a short real-feeling story of one person\'s problem and turnaround (no names, no guarantees).',
      },
      {
        label: 'Q&A',
        prompt: 'Q&A format: open with a question the audience keeps asking, answer it clearly, close with what to do next.',
      },
      {
        label: 'Before & After',
        prompt: 'Before-and-after format: contrast the stuck "before" state and the improved "after" state; reuse the same character across scenes.',
      },
    ],
  },
  {
    key: 'constraints',
    label: 'Context & Constraints — The Parameters',
    hint: 'Who it targets or what to include/avoid',
    presets: [
      {
        label: 'Target busy professionals',
        prompt: 'Target audience for this script: busy working professionals who are short on time.',
      },
      {
        label: 'Target beginners / first-timers',
        prompt: 'Target audience for this script: complete beginners or first-time customers new to this topic.',
      },
      {
        label: 'Target loyal / returning customers',
        prompt: 'Target audience for this script: existing, returning customers who already know the brand.',
      },
      {
        label: 'Local / seasonal angle',
        prompt: 'Give this script a local, timely angle: tie it to everyday local life or the current season so it feels posted today, not evergreen.',
      },
    ],
  },
  {
    key: 'flow',
    label: 'The Flow',
    hint: 'How the script moves beat to beat',
    presets: [
      {
        label: 'Hook → Problem → Solution → CTA',
        prompt: 'Flow: hook, then the problem the viewer recognizes, then the solution, then the call to action.',
      },
      {
        label: 'Hook → Myth → Truth → CTA',
        prompt: 'Flow: hook, then state the myth, then reveal the truth that debunks it, then the call to action.',
      },
      {
        label: 'Hook → Story → Payoff → CTA',
        prompt: 'Flow: hook, then a short story the viewer can see themselves in, then the payoff or lesson, then the call to action.',
      },
      {
        label: 'Question → Answer → Proof → CTA',
        prompt: 'Flow: open with a question, answer it directly, back it with proof or a vivid example, then the call to action.',
      },
      {
        label: 'Hook → List → CTA',
        prompt: 'Flow: hook, then a rapid numbered list (one item per scene), then the call to action.',
      },
    ],
  },
];

/**
 * Merge an operator-saved `script_direction_presets` setting over the built-in
 * defaults. Field labels/hints always come from code; only the preset options
 * are overridable. Invalid or empty per-field data falls back to the default
 * options for that field, so a malformed setting can never blank a dropdown.
 */
export function resolveDirectionFields(stored: unknown): DirectionField[] {
  const byKey = (stored ?? {}) as Record<string, unknown>;
  return DEFAULT_DIRECTION_FIELDS.map((field) => {
    const raw = byKey[field.key];
    if (!Array.isArray(raw)) return field;
    const presets = raw
      .filter(
        (p): p is DirectionPreset =>
          !!p &&
          typeof p === 'object' &&
          typeof (p as DirectionPreset).label === 'string' &&
          typeof (p as DirectionPreset).prompt === 'string' &&
          (p as DirectionPreset).label.trim() !== '' &&
          (p as DirectionPreset).prompt.trim() !== '',
      )
      .map((p) => ({ label: p.label.trim(), prompt: p.prompt.trim() }));
    return presets.length ? { ...field, presets } : field;
  });
}

/** One preset per line, `Label | prompt` — the human-editable Settings format. */
export function presetsToText(presets: DirectionPreset[]): string {
  return presets.map((p) => `${p.label} | ${p.prompt}`).join('\n');
}

export function textToPresets(text: string): DirectionPreset[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const i = line.indexOf('|');
      if (i === -1) return { label: line, prompt: line };
      return { label: line.slice(0, i).trim(), prompt: line.slice(i + 1).trim() };
    })
    .filter((p) => p.label && p.prompt);
}
