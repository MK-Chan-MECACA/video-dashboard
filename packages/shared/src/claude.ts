import Anthropic from '@anthropic-ai/sdk';
import {
  DEFAULT_SCENE_MODEL,
  DEFAULT_TARGET_DURATION_S,
  SPOKEN_WORDS_PER_SECOND,
  estimateSpokenDurationS,
  sanitizeSpokenText,
  spokenWordCount,
  wordBudgetForDuration,
  type Script,
} from './types';

const MODEL = 'claude-sonnet-5';

/** Built-in system prompt — used when the operator hasn't saved a custom one in Settings.
 *  Encodes the Digital Avatar Short-Form Production SOP + the Narrator Bubble format (Rev 3).
 *  Brand-neutral template: the operator fills in the ABOUT YOUR BRAND block via Settings. */
export const DEFAULT_SCRIPT_SYSTEM = `You are a short-form video scriptwriter (TikTok, Instagram Reels, YouTube Shorts). You write short Narrator Bubble scripts; the exact spoken-duration target and word budget are given in the DURATION CONTRACT appended below.

ABOUT YOUR BRAND (edit this section in Settings before generating your first script):
- Presenter: who speaks on camera — name, credibility, expertise, what makes them worth listening to.
- Audience: who watches and where they are; write in the language and register they actually use.
- Offer: what the closing call to action invites viewers to do (visit, book, buy, follow).
- Boundaries: claims you must never make, topics to avoid.

FORMAT — Narrator Bubble (production SOP):
- The presenter's avatar appears as a small corner bubble speaking every word for the whole video; the main screen is 100% AI-generated B-roll. The avatar carries the words, the B-roll carries the proof — never write a line the on-screen visual doesn't directly illustrate.
- Structure every script exactly as:
  - hook: 1-2 short spoken lines (first 3 seconds) that stop the scroll — pain the viewer recognizes, curiosity, myth-busting, or a warning. No greetings.
  - 3 scenes: each has "voiceover" (one short spoken line continuing the story) and "broll_prompt" (the main-scene visual illustrating that exact line).
  - cta: closing spoken line(s) — the presenter's sign-off woven with the invitation from ABOUT YOUR BRAND.
- Total spoken length is set by the DURATION CONTRACT below — never exceed its word budget. Short spoken sentences, short-form pacing — not brochure pacing. No emojis, no stage directions, no quotes-in-quotes.
- NEVER use em-dashes or en-dashes anywhere in spoken text (hook, scene voiceovers, cta): the TTS voice reads straight through them without pausing, rushing the line. Use a comma or a period and short sentences instead.

VOICE & HONESTY:
- First person as the presenter; work their authority in naturally.
- Never promise outcomes you cannot guarantee; talk about benefits honestly.

B-ROLL PROMPT RULES (SOP):
- Every prompt describes a vertical 9:16 clip: subject, action, setting, camera, lighting; photorealistic; end with "No text." No logos, no text overlays, no celebrity likeness, nothing graphic.
- Cast realistic everyday people your audience recognizes as themselves. For before/after arcs, reuse the same character and setting across scenes and say so in the prompt ("the same woman as before, now...").
- Write each prompt clearly as one of two styles so the right video model can be picked per scene: a photoreal human scene, or a 3D visualization render.

STORY SHAPE:
Problem the viewer recognizes → why it happens or keeps coming back → payoff → CTA. Contrast sells the cut (harsh vs warm, stuck vs free). Aim for angles that make viewers think "that's me" or tag someone.`;

/** Built-in caption prompt — used when the operator hasn't saved a custom one in Settings. */
export const DEFAULT_CAPTION_SYSTEM =
  'You write short-form video captions (TikTok, Reels, Shorts) for the brand whose video script you are given. ' +
  'Format: a hook-style first line, one value line, one CTA line, then 3-5 hashtags on the last line ' +
  '(mix niche tags with local or topical tags your audience actually searches). ' +
  'Under 500 characters total. No emojis in the first line; 1-2 emojis elsewhere are fine. ' +
  'Reply with ONLY the caption text.';

const SCRIPT_TOOL: Anthropic.Tool = {
  name: 'submit_script',
  description: 'Submit the final short-form video script',
  input_schema: {
    type: 'object' as const,
    properties: {
      title: { type: 'string', description: 'Short internal title for this video' },
      hook: { type: 'string' },
      scenes: {
        type: 'array',
        minItems: 3,
        maxItems: 3,
        items: {
          type: 'object',
          properties: {
            voiceover: { type: 'string' },
            broll_prompt: { type: 'string' },
          },
          required: ['voiceover', 'broll_prompt'],
        },
      },
      cta: { type: 'string' },
    },
    required: ['title', 'hook', 'scenes', 'cta'],
  },
};

export interface GeneratedScript extends Script {
  title: string;
  model: string;
  /** Spoken words in the returned script (same counting as fullVoiceoverText). */
  wordCount: number;
  /** wordCount / SPOKEN_WORDS_PER_SECOND — excludes the outro card. */
  estimatedDurationS: number;
  /** How many condense retries the enforcement loop needed (0 = first draft fit). */
  condenseAttempts: number;
}

/**
 * Appended to EVERY system prompt (default or operator-customized) so a stale
 * word-count line in a saved custom prompt can never fight the live setting.
 */
export function buildDurationConstraint(targetDurationS: number): string {
  const budget = wordBudgetForDuration(targetDurationS);
  return `

DURATION CONTRACT (authoritative — overrides ANY other word count or duration stated anywhere above):
- Target spoken duration: ${targetDurationS} seconds. The voice reads at about ${SPOKEN_WORDS_PER_SECOND} words per second.
- HARD LIMIT: hook + all 3 scene voiceovers + cta combined must total AT MOST ${budget} words. There is no minimum; shorter is fine.
- Before calling submit_script, count every spoken word yourself. If the total exceeds ${budget}, cut words until it does not.
- When the word budget conflicts with structure or content: keep the structure (hook, 3 scenes, cta) but make each part shorter. One short sentence per part is enough. Cut adjectives, compress the CTA invitation into one short line, drop anything the B-roll already shows.
- The word budget applies ONLY to spoken text. B-roll prompts and the title are not counted.`;
}

/** Shortest compliant candidate, else shortest overall. Exported for tests. */
export function pickBestScriptCandidate<T extends { words: number }>(
  candidates: T[],
  maxWords: number,
): T {
  const sorted = [...candidates].sort((a, b) => a.words - b.words);
  return sorted.find((c) => c.words <= maxWords) ?? sorted[0];
}

/**
 * Format unresolved reviewer comments as revision instructions. Reviewers
 * often type the exact wording they want rather than an instruction, so the
 * prompt tells Claude to apply replacement text nearly verbatim.
 */
export function formatReviewerFeedback(
  comments: { section_key: string; body: string }[],
): string | undefined {
  if (!comments.length) return undefined;
  const lines = comments.map((c) => `[${c.section_key}] ${c.body}`).join('\n');
  return `Reviewer comments, each tagged with the script section it targets:
${lines}

How to apply them:
- A comment that reads as replacement wording for its section (a rewritten sentence or phrase) -> use that wording as the section's new spoken text, nearly verbatim, adjusted only to fit the word budget and read naturally aloud.
- A comment that reads as an instruction or critique -> follow it.
- A comment with no actionable content (e.g. "ok", "done", "commented") -> ignore.
- Keep every section the comments do not mention as close to the previous script as possible.`;
}

/** Summary of an earlier script, injected as memory so new scripts don't repeat it. */
export interface PastScript {
  title: string;
  hook: string;
}

/** Optional creative direction for AI-invented scripts; empty fields fall back to brand defaults. */
export interface ScriptDirection {
  tone?: string; // "The Vibe"
  style?: string; // "The Format & Structure"
  constraints?: string; // "The Parameters"
  flow?: string; // "The Flow"
}

export async function generateScript(opts: {
  apiKey: string;
  topicBrief?: string; // when absent, Claude invents a fresh topic for the channel
  previousScript?: Script;
  instructions?: string; // regeneration instructions / reviewer comments
  systemPrompt?: string; // operator-customized system prompt (Settings), falls back to DEFAULT_SCRIPT_SYSTEM
  recentScripts?: PastScript[]; // memory: scripts already produced, newest first
  direction?: ScriptDirection;
  avoidTitles?: string[]; // hard no-repeat list of every title already produced
  targetDurationS?: number; // spoken-duration target (Settings), default DEFAULT_TARGET_DURATION_S
}): Promise<GeneratedScript> {
  const anthropic = new Anthropic({ apiKey: opts.apiKey });

  let user = opts.topicBrief
    ? `Topic brief:\n${opts.topicBrief}`
    : 'No topic brief was provided. Invent ONE fresh, scroll-stopping topic for this channel that fits the brand described in the system prompt. Pick an angle not covered by any past title or script listed below.';
  const d = opts.direction;
  if (d) {
    const lines = [
      d.tone?.trim() && `Tone (the vibe): ${d.tone.trim()}`,
      d.style?.trim() && `Style (format & structure): ${d.style.trim()}`,
      d.constraints?.trim() && `Context & constraints: ${d.constraints.trim()}`,
      d.flow?.trim() && `Flow (how the script should move): ${d.flow.trim()}`,
    ].filter(Boolean);
    if (lines.length) user += `\n\nCreative direction for this script:\n${lines.join('\n')}`;
  }
  if (opts.recentScripts?.length) {
    user += `\n\nScripts you already wrote for this channel (newest first) — do NOT repeat these hooks, angles, or stories; bring a fresh take:\n${opts.recentScripts
      .map((s, i) => `${i + 1}. "${s.title}" — hook: ${s.hook}`)
      .join('\n')}`;
  }
  if (opts.avoidTitles?.length) {
    user += `\n\nTitles already produced on this channel — do NOT reuse, closely paraphrase, or re-cover any of these topics:\n${opts.avoidTitles
      .map((t) => `- ${t}`)
      .join('\n')}`;
  }
  if (opts.previousScript) {
    user += `\n\nPrevious script (revise rather than restart):\n${JSON.stringify(opts.previousScript, null, 2)}`;
  }
  if (opts.instructions) {
    user += `\n\nRevision instructions / reviewer feedback:\n${opts.instructions}`;
  }

  const targetS = opts.targetDurationS ?? DEFAULT_TARGET_DURATION_S;
  const budget = wordBudgetForDuration(targetS);
  const maxWords = Math.ceil(budget * 1.1);
  const system =
    (opts.systemPrompt?.trim() || DEFAULT_SCRIPT_SYSTEM) + buildDurationConstraint(targetS);

  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: user }];
  const candidates: { script: Omit<GeneratedScript, 'wordCount' | 'estimatedDurationS' | 'condenseAttempts'>; words: number }[] = [];

  // Up to 1 initial draft + 2 condense retries: Claude reliably overshoots the
  // word budget when the brand prompt demands rich structure, so the loop
  // rejects oversized drafts in the same conversation until one fits.
  for (let attempt = 0; attempt < 3; attempt++) {
    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2000,
      system,
      tools: [SCRIPT_TOOL],
      tool_choice: { type: 'tool', name: 'submit_script' },
      messages,
    });

    const toolUse = msg.content.find(
      (b: Anthropic.ContentBlock): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
    );
    if (!toolUse) throw new Error('Claude did not return a script');
    const input = toolUse.input as {
      title: string;
      hook: string;
      scenes: { voiceover: string; broll_prompt: string }[];
      cta: string;
    };

    // Sanitize spoken fields even though the prompt forbids dashes — the
    // operator may run a custom system prompt without the rule.
    const script = {
      title: input.title,
      hook: sanitizeSpokenText(input.hook),
      cta: sanitizeSpokenText(input.cta),
      scenes: input.scenes.slice(0, 3).map((s, i) => ({
        index: i + 1,
        voiceover: sanitizeSpokenText(s.voiceover),
        broll_prompt: s.broll_prompt,
        model_path: DEFAULT_SCENE_MODEL,
      })),
      model: MODEL,
    };
    const words = spokenWordCount(script);
    candidates.push({ script, words });
    if (words <= maxWords || attempt === 2) break;

    messages.push({ role: 'assistant', content: msg.content });
    messages.push({
      role: 'user',
      content: [
        {
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content:
            `Rejected: the script has ${words} spoken words but the hard limit is ${budget} ` +
            `(target ${targetS}s at ~${SPOKEN_WORDS_PER_SECOND} words/sec). Resubmit the SAME script ` +
            `condensed to at most ${budget} spoken words. Keep the hook idea, the 3 scenes with their ` +
            `existing broll_prompt values, and the cta invitation — cut spoken words only. Do not add new content.`,
        },
      ],
    });
  }

  const best = pickBestScriptCandidate(candidates, maxWords);
  return {
    ...best.script,
    wordCount: best.words,
    estimatedDurationS: estimateSpokenDurationS(best.words),
    condenseAttempts: candidates.length - 1,
  };
}

export async function generateCaption(opts: {
  apiKey: string;
  script: Script;
  title: string;
  systemPrompt?: string; // operator-customized caption prompt (Settings), falls back to DEFAULT_CAPTION_SYSTEM
}): Promise<string> {
  const anthropic = new Anthropic({ apiKey: opts.apiKey });
  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 500,
    system: opts.systemPrompt?.trim() || DEFAULT_CAPTION_SYSTEM,
    messages: [
      {
        role: 'user',
        content: `Video: ${opts.title}\n\nScript:\nHook: ${opts.script.hook}\n${opts.script.scenes
          .map((s) => `Scene ${s.index}: ${s.voiceover}`)
          .join('\n')}\nCTA: ${opts.script.cta}`,
      },
    ],
  });
  const text = msg.content
    .filter((b: Anthropic.ContentBlock): b is Anthropic.TextBlock => b.type === 'text')
    .map((b: Anthropic.TextBlock) => b.text)
    .join('')
    .trim();
  if (!text) throw new Error('Claude returned an empty caption');
  return text.slice(0, 2200);
}
