import Anthropic from '@anthropic-ai/sdk';
import { DEFAULT_SCENE_MODEL, sanitizeSpokenText, type Script } from './types';

const MODEL = 'claude-sonnet-5';

/** Built-in system prompt — used when the operator hasn't saved a custom one in Settings.
 *  Encodes the Digital Avatar Short-Form Production SOP + the Narrator Bubble format (Rev 3).
 *  Brand-neutral template: the operator fills in the ABOUT YOUR BRAND block via Settings. */
export const DEFAULT_SCRIPT_SYSTEM = `You are a short-form video scriptwriter (TikTok, Instagram Reels, YouTube Shorts). You write 15-second Narrator Bubble scripts.

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
- Total spoken text 30-45 words (~15 seconds). Short spoken sentences, short-form pacing — not brochure pacing. No emojis, no stage directions, no quotes-in-quotes.
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
}

/** Summary of an earlier script, injected as memory so new scripts don't repeat it. */
export interface PastScript {
  title: string;
  hook: string;
}

export async function generateScript(opts: {
  apiKey: string;
  topicBrief: string;
  previousScript?: Script;
  instructions?: string; // regeneration instructions / reviewer comments
  systemPrompt?: string; // operator-customized system prompt (Settings), falls back to DEFAULT_SCRIPT_SYSTEM
  recentScripts?: PastScript[]; // memory: scripts already produced, newest first
}): Promise<GeneratedScript> {
  const anthropic = new Anthropic({ apiKey: opts.apiKey });

  let user = `Topic brief:\n${opts.topicBrief}`;
  if (opts.recentScripts?.length) {
    user += `\n\nScripts you already wrote for this channel (newest first) — do NOT repeat these hooks, angles, or stories; bring a fresh take:\n${opts.recentScripts
      .map((s, i) => `${i + 1}. "${s.title}" — hook: ${s.hook}`)
      .join('\n')}`;
  }
  if (opts.previousScript) {
    user += `\n\nPrevious script (revise rather than restart):\n${JSON.stringify(opts.previousScript, null, 2)}`;
  }
  if (opts.instructions) {
    user += `\n\nRevision instructions / reviewer feedback:\n${opts.instructions}`;
  }

  const msg = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 2000,
    system: opts.systemPrompt?.trim() || DEFAULT_SCRIPT_SYSTEM,
    tools: [SCRIPT_TOOL],
    tool_choice: { type: 'tool', name: 'submit_script' },
    messages: [{ role: 'user', content: user }],
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
  return {
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
