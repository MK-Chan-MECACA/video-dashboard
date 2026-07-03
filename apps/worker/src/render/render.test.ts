/**
 * Tiny dependency-free test for the pure render plan + ASS builders.
 * Run with: pnpm --filter @vd/worker test   (tsx src/render/render.test.ts)
 */
import assert from 'node:assert/strict';
import {
  computeSceneCoverageWindows,
  resolveRenderTemplate,
  normalizeWordTimestamps,
  sanitizeSpokenText,
  stripMarkerWords,
  DEFAULT_RENDER_TEMPLATE,
  type Script,
  type WordTimestamp,
} from '@vd/shared';
import { buildAss, escapeAssText, formatAssTime, groupWordsIntoCues } from './ass';
import { bubbleCropPx, buildRenderPlan, escapeFilterPath, fitClipToWindow, overlayPosition } from './render';

// --- fitClipToWindow ---
assert.deepEqual(fitClipToWindow(8, 6), { setptsFactor: 1, tpadSeconds: 0 }, 'long clip untouched');
{
  const fit = fitClipToWindow(5, 6); // 6/5 = 1.2 <= 1.25 -> pure slowdown
  assert.ok(Math.abs(fit.setptsFactor - 1.2) < 1e-9);
  assert.ok(fit.tpadSeconds < 1e-9);
}
{
  const fit = fitClipToWindow(4, 6); // 6/4 = 1.5 -> capped at 1.25, tpad the rest
  assert.equal(fit.setptsFactor, 1.25);
  assert.ok(Math.abs(fit.tpadSeconds - 1) < 1e-9); // 6 - 4*1.25 = 1
}

// --- ASS helpers ---
assert.equal(formatAssTime(61.234), '0:01:01.23');
assert.equal(escapeAssText('a {b} \\ c'), 'a (b) / c');

const mkWords = (words: string[], startAt = 0, dur = 0.3): WordTimestamp[] =>
  words.map((w, i) => ({ word: w, start: startAt + i * dur, end: startAt + i * dur + dur }));

{
  // punctuation breaks (>=2 words), max 4 words per cue
  const cues = groupWordsIntoCues(mkWords(['Back', 'pain?', 'You', 'need', 'to', 'hear', 'this.']));
  assert.equal(cues[0].text, 'Back pain?');
  assert.equal(cues[1].text, 'You need to hear');
  assert.equal(cues[2].text, 'this.');
}
{
  // >1.2s gap forces a break
  const words: WordTimestamp[] = [
    { word: 'hello', start: 0, end: 0.3 },
    { word: 'there', start: 2.0, end: 2.3 },
    { word: 'friend', start: 2.3, end: 2.6 },
  ];
  const cues = groupWordsIntoCues(words);
  assert.equal(cues.length, 2);
  assert.equal(cues[0].text, 'hello');
  assert.equal(cues[1].text, 'there friend');
}

// --- HeyGen marker tokens ("<start>"/"<end>") never reach subtitles ---
{
  const words: WordTimestamp[] = [
    { word: '<start>', start: 0, end: 0 },
    { word: 'Played', start: 0.14, end: 0.379 },
    { word: 'badminton', start: 0.399, end: 0.959 },
    { word: '<end>', start: 1.0, end: 1.0 },
  ];
  const clean = stripMarkerWords(words);
  assert.deepEqual(clean.map((w) => w.word), ['Played', 'badminton']);
  const cues = groupWordsIntoCues(clean);
  assert.equal(cues[0].text, 'Played badminton');
}
{
  // normalizeWordTimestamps drops markers at the source
  const normalized = normalizeWordTimestamps([
    { word: '<start>', start: 0, end: 0 },
    { word: 'hello', start: 0.1, end: 0.4 },
    { word: '<END>', start_time: 0.5, end_time: 0.5 },
  ]);
  assert.deepEqual(normalized.map((w) => w.word), ['hello']);
}

// --- sanitizeSpokenText: em/en dashes become real pauses ---
assert.equal(sanitizeSpokenText('Back pain—it keeps returning'), 'Back pain, it keeps returning');
assert.equal(sanitizeSpokenText('Wait – really?'), 'Wait, really?');
assert.equal(sanitizeSpokenText('One trick -- works'), 'One trick, works');
assert.equal(sanitizeSpokenText('done—.'), 'done.');
assert.equal(sanitizeSpokenText('so fast—'), 'so fast.');
assert.equal(sanitizeSpokenText('a well-known move'), 'a well-known move', 'single hyphens untouched');
assert.equal(sanitizeSpokenText('pain—relief').split(' ').length, 2, 'dash split adds a word consistently');

// --- computeSceneCoverageWindows: 3 contiguous windows tiling [0, total] ---
const coverageScript: Script = {
  hook: 'Back pain again?',
  scenes: [
    { index: 1, voiceover: 'It keeps coming back.', broll_prompt: '', model_path: '' },
    { index: 2, voiceover: 'One visit fixes it.', broll_prompt: '', model_path: '' },
    { index: 3, voiceover: 'You walk out free.', broll_prompt: '', model_path: '' },
  ],
  cta: 'Book now.',
};
{
  // 17 words at 0.5s each: scene_2 starts at word 7 (3.5s), scene_3 at word 11 (5.5s)
  const coverageWords = (
    'Back pain again? It keeps coming back. One visit fixes it. You walk out free. Book now.'
  )
    .split(' ')
    .map((w, i) => ({ word: w, start: i * 0.5, end: i * 0.5 + 0.5 }));
  const wins = computeSceneCoverageWindows(coverageScript, coverageWords, 12);
  assert.deepEqual(
    wins.map((w) => [w.section, w.start, w.end]),
    [
      ['scene_1', 0, 3.5],
      ['scene_2', 3.5, 5.5],
      ['scene_3', 5.5, 12],
    ],
    'scene 1 absorbs the hook, scene 3 the cta, no gaps',
  );
}
{
  // word/section match failure -> equal thirds, still tiling [0, total]
  const wins = computeSceneCoverageWindows(coverageScript, [], 9);
  assert.deepEqual(
    wins.map((w) => [w.start, w.end]),
    [
      [0, 3],
      [3, 6],
      [6, 9],
    ],
    'fallback equal thirds',
  );
}

// --- escapeFilterPath ---
assert.equal(escapeFilterPath("/tmp/a'b:c,d.ass"), "'/tmp/a\\'b\\:c\\,d.ass'");

// --- template helpers ---
assert.equal(overlayPosition('top_right', 30), 'x=W-w-30:y=30');
assert.equal(overlayPosition('bottom_left', 24), 'x=24:y=H-h-24');
assert.equal(overlayPosition('top_center', 60), 'x=(W-w)/2:y=60');
{
  // default head crop: 0.6 of 1080 = 648px square, centered, near the top
  const c = bubbleCropPx(DEFAULT_RENDER_TEMPLATE.avatarBubble.crop);
  assert.deepEqual(c, { size: 648, x: 216, y: 38 });
}
{
  // partial/garbage stored settings fall back to defaults and clamp
  const t = resolveRenderTemplate({ logo: { position: 'nowhere', widthPx: 9999 }, avatarBubble: { diameterPx: 461 } });
  assert.equal(t.logo.position, 'top_right');
  assert.equal(t.logo.widthPx, 1080);
  assert.equal(t.avatarBubble.diameterPx % 2, 0, 'bubble diameter forced even');
  assert.equal(t.subtitles.marginVPx, DEFAULT_RENDER_TEMPLATE.subtitles.marginVPx);
}

// --- buildRenderPlan ---
const words = mkWords(
  'Stop cracking your own neck. Here is why. A skilled specialist fixes it really fast. Visit us today.'.split(' '),
  0,
  0.5,
);
const plan = buildRenderPlan({
  avatarPath: '/tmp/in/avatar.mp4',
  avatarDurationS: 16,
  scenes: [
    { path: '/tmp/in/scene_1.mp4', durationS: 5, windowStart: 2, windowEnd: 6 },
    { path: '/tmp/in/scene_2.mp4', durationS: 3, windowStart: 6, windowEnd: 10.5 },
    { path: '/tmp/in/scene_3.mp4', durationS: 8, windowStart: 10.5, windowEnd: 14 },
  ],
  words,
  subsPath: '/tmp/in/subs.ass',
  outPath: '/tmp/in/final.mp4',
  logoPath: '/tmp/in/logo.png',
  outroPath: '/tmp/in/outro.png',
  bgmPath: '/tmp/in/bgm.mp3',
  bubbleMaskPath: '/tmp/in/bubble_mask.png',
});

const graph = plan.args[plan.args.indexOf('-filter_complex') + 1];
assert.ok(graph, 'has a filter_complex');

// each scene overlaid exactly inside its section window
assert.ok(graph.includes("enable='between(t,2,6)'"), 'scene 1 window');
assert.ok(graph.includes("enable='between(t,6,10.5)'"), 'scene 2 window');
assert.ok(graph.includes("enable='between(t,10.5,14)'"), 'scene 3 window');
// PTS shift lines scenes up with their windows
assert.ok(graph.includes('setpts=PTS-STARTPTS+2/TB'), 'scene 1 pts shift');
assert.ok(graph.includes('setpts=PTS-STARTPTS+10.5/TB'), 'scene 3 pts shift');
// scene 2 (3s into a 4.5s window): slow to 1.25x then tpad 0.75s
assert.ok(graph.includes('setpts=1.25*PTS'), 'scene 2 slowdown');
assert.ok(graph.includes('tpad=stop_mode=clone:stop_duration=0.75'), 'scene 2 tpad');
// avatar head bubble: split base, circular crop, pinned for the whole main video
assert.ok(graph.includes('split=2[base][avsrc]'), 'avatar split for bubble');
assert.ok(graph.includes('[avsrc]crop=648:648:216:38,scale=460:460'), 'head crop + bubble scale');
assert.ok(graph.includes('alphamerge'), 'circular mask applied');
assert.ok(
  graph.includes("overlay=x=24:y=H-h-24:eof_action=pass:enable='between(t,0,16)'"),
  'bubble bottom-left for the whole main video',
);
// logo overlay top-right (default template), enabled for the whole main part
assert.ok(graph.includes('scale=w=240:h=-1[logo]'), 'logo scaled to template width');
assert.ok(graph.includes("overlay=x=W-w-30:y=30:eof_action=pass:enable='between(t,0,16)'"), 'logo overlay');
// subtitles burned before the outro concat
assert.ok(graph.includes("subtitles=filename='/tmp/in/subs.ass'"), 'subtitles filter');
assert.ok(graph.indexOf('subtitles=') < graph.indexOf('concat='), 'subs before concat');
assert.ok(graph.includes('concat=n=2:v=1:a=0'), 'outro concat');
// audio: ducked bgm plays through the outro, voiceover padded before the mix
assert.ok(graph.includes('volume=0.13'), 'bgm ducked');
assert.ok(graph.includes('afade=t=out:st=16:d=3'), 'bgm fade ends with the outro');
assert.ok(graph.includes('amix=inputs=2:duration=first'), 'amix');
assert.ok(graph.includes('[0:a]apad=whole_dur=19[vo]'), 'voiceover padded to main+outro before amix');
assert.equal(plan.mainDurationS, 16);
assert.equal(plan.totalDurationS, 19);

// output settings
const tail = plan.args.join(' ');
assert.ok(tail.includes('-c:v libx264 -preset veryfast -x264-params rc-lookahead=20 -threads 2 -crf 20 -pix_fmt yuv420p -r 30'), 'video codec opts');
assert.ok(tail.includes('-c:a aac -b:a 192k -movflags +faststart'), 'audio/mux opts');

// ASS output — default template: 64px, 560px above bottom, uppercase cues
assert.ok(plan.subs.includes('PlayResX: 1080'), 'ass canvas');
assert.ok(plan.subs.includes('Montserrat ExtraBold,64,'), 'ass font + size');
assert.ok(plan.subs.includes(',60,60,560,1'), 'ass MarginV from template');
assert.ok(plan.subs.includes('STOP CRACKING'), 'uppercase cues');
assert.ok(plan.subs.includes('Dialogue: 0,0:00:00.00,'), 'ass first cue');

// no outro / no extras: single video branch, plain apad
const bare = buildRenderPlan({
  avatarPath: '/a.mp4',
  avatarDurationS: 10,
  scenes: [{ path: '/s1.mp4', durationS: 4, windowStart: 1, windowEnd: 5 }],
  words,
  subsPath: '/subs.ass',
  outPath: '/out.mp4',
});
const bareGraph = bare.args[bare.args.indexOf('-filter_complex') + 1];
assert.ok(!bareGraph.includes('concat='), 'no concat without outro');
assert.ok(!bareGraph.includes('amix'), 'no amix without bgm');
assert.ok(!bareGraph.includes('alphamerge'), 'no bubble without a mask path');
assert.ok(!bareGraph.includes('split='), 'no avatar split without a bubble');
assert.ok(bareGraph.includes('apad=whole_dur=10'), 'apad to main only');

// bubble disabled via template even when a mask path is provided
const noBubble = buildRenderPlan({
  avatarPath: '/a.mp4',
  avatarDurationS: 10,
  scenes: [{ path: '/s1.mp4', durationS: 4, windowStart: 1, windowEnd: 5 }],
  words,
  subsPath: '/subs.ass',
  outPath: '/out.mp4',
  bubbleMaskPath: '/mask.png',
  template: resolveRenderTemplate({ avatarBubble: { enabled: false } }),
});
const noBubbleGraph = noBubble.args[noBubble.args.indexOf('-filter_complex') + 1];
assert.ok(!noBubbleGraph.includes('alphamerge'), 'template can turn the bubble off');

console.log('render.test.ts: all assertions passed');
