/**
 * Tiny dependency-free test for the target-duration helpers and the
 * script-generation word-budget enforcement plumbing.
 * Run with: pnpm --filter @vd/worker test   (tsx src/scriptDuration.test.ts)
 */
import assert from 'node:assert/strict';
import {
  DEFAULT_TARGET_DURATION_S,
  buildDurationConstraint,
  effectiveSpokenTargetS,
  estimateOutroDurationS,
  pickBestScriptCandidate,
  resolveTargetDurationS,
  resolveTargetIncludesOutro,
  spokenWordCount,
  wordBudgetForDuration,
  type Script,
} from '@vd/shared';

// --- wordBudgetForDuration ---
assert.equal(wordBudgetForDuration(15), 33, '15s -> 33 words at 2.2 w/s');
assert.equal(wordBudgetForDuration(30), 66, '30s -> 66 words');

// --- resolveTargetDurationS ---
assert.equal(resolveTargetDurationS(15), 15);
assert.equal(resolveTargetDurationS('15'), 15, 'string values from the settings UI parse');
assert.equal(resolveTargetDurationS(null), DEFAULT_TARGET_DURATION_S, 'unset -> default');
assert.equal(resolveTargetDurationS('abc'), DEFAULT_TARGET_DURATION_S, 'garbage -> default');
assert.equal(resolveTargetDurationS(2), 6, 'clamped to minimum 6s');
assert.equal(resolveTargetDurationS(999), 60, 'clamped to maximum 60s');
assert.equal(resolveTargetDurationS(14.6), 15, 'rounded');

// --- resolveTargetIncludesOutro ---
assert.equal(resolveTargetIncludesOutro(true), true);
assert.equal(resolveTargetIncludesOutro('true'), true);
assert.equal(resolveTargetIncludesOutro(false), false);
assert.equal(resolveTargetIncludesOutro(null), false, 'unset -> spoken-only mode');

// --- estimateOutroDurationS ---
assert.equal(estimateOutroDurationS(null), 0, 'no outro asset');
assert.equal(estimateOutroDurationS({ r2_key: 'brand/outro.png' }), 3, 'still card -> 3s');
assert.equal(estimateOutroDurationS({ r2_key: 'brand/outro.mp4' }), 5, 'video outro -> 5s');
assert.equal(
  estimateOutroDurationS({ r2_key: 'brand/outro.mp4', meta: { duration_s: 4.2 } }),
  4.2,
  'stored duration wins',
);

// --- effectiveSpokenTargetS ---
assert.equal(effectiveSpokenTargetS(15, false, 3), 15, 'spoken-only mode ignores outro');
assert.equal(effectiveSpokenTargetS(15, true, 3), 12, 'total mode subtracts outro');
assert.equal(effectiveSpokenTargetS(8, true, 5), 6, 'floored at 6s of speech');

// --- spokenWordCount matches the text HeyGen receives ---
const script: Script = {
  hook: 'You tried ChatGPT once — got a boring answer.',
  scenes: [
    { index: 1, voiceover: 'Most people type one lazy line.', broll_prompt: 'x', model_path: 'm' },
    { index: 2, voiceover: 'AI needs context.', broll_prompt: 'y', model_path: 'm' },
    { index: 3, voiceover: 'Give it your goal.', broll_prompt: 'z', model_path: 'm' },
  ],
  cta: 'Register through the link.',
};
// em-dash is sanitized to a comma, so "once — got" is 2 words, not 3 tokens.
assert.equal(spokenWordCount(script), 25, 'counts sanitized spoken words only');

// --- buildDurationConstraint ---
const constraint = buildDurationConstraint(15);
assert.ok(constraint.includes('AT MOST 33 words'), 'states the hard word limit');
assert.ok(constraint.includes('overrides ANY other word count'), 'keeps the authority clause');
assert.ok(constraint.includes('15 seconds'), 'names the target duration');

// --- pickBestScriptCandidate ---
{
  const c = (words: number) => ({ words });
  assert.equal(
    pickBestScriptCandidate([c(40), c(30), c(35)], 36).words,
    30,
    'shortest compliant wins',
  );
  assert.equal(
    pickBestScriptCandidate([c(50), c(45), c(48)], 36).words,
    45,
    'none compliant -> shortest overall',
  );
  assert.equal(pickBestScriptCandidate([c(20)], 36).words, 20, 'single candidate');
}

console.log('scriptDuration.test.ts: all assertions passed');
