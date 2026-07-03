/**
 * Tests for the HyperFrames composition builder (pure — no I/O).
 * Run with: pnpm --filter @vd/worker test
 */
import assert from 'node:assert/strict';
import { resolveRenderTemplate, type WordTimestamp } from '@vd/shared';
import { buildHfComposition, bubbleCss, escapeHtml, hfProjectFiles, logoCss } from './hyperframes';

const mkWords = (words: string[], startAt = 0, dur = 0.5): WordTimestamp[] =>
  words.map((w, i) => ({ word: w, start: startAt + i * dur, end: startAt + i * dur + dur }));

// --- escapeHtml ---
assert.equal(escapeHtml('a <b> & "c"'), 'a &lt;b&gt; &amp; &quot;c&quot;');

// --- logoCss ---
assert.ok(logoCss(resolveRenderTemplate({}).logo, 2).includes('top: 30px; right: 30px;'), 'default top-right');
assert.ok(logoCss(resolveRenderTemplate({}).logo, 2).includes('width: 240px; height: 120px;'), 'explicit height from aspect');
assert.ok(
  logoCss(resolveRenderTemplate({ logo: { position: 'top_center' } }).logo, 2).includes('left: 420px;'),
  'top-center is computed px, (1080-240)/2',
);

// --- bubbleCss (default: crop 648px @ (216,38), 460px circle, bottom-left m=24) ---
{
  const css = bubbleCss(resolveRenderTemplate({}).avatarBubble);
  // k = 460/648 -> element 767x1363, circle centre (383,257) in element coords
  assert.ok(css.includes('width: 767px; height: 1363px;'), 'oversized element for head zoom');
  assert.ok(css.includes('clip-path: circle(230px at 383px 257px)'), 'circular clip');
  // canvas centre (24+230, 1920-24-230) -> left 254-383=-129, top 1666-257=1409
  assert.ok(css.includes('left: -129px; top: 1409px;'), 'bottom-left placement');
}

// --- buildHfComposition ---
const words = mkWords('Stop cracking your own neck here is why'.split(' '));
const comp = buildHfComposition({
  avatarFile: 'assets/avatar.mp4',
  avatarDurationS: 16,
  scenes: [
    { file: 'assets/scene_1.mp4', windowStart: 2, windowEnd: 6 },
    { file: 'assets/scene_2.mp4', windowStart: 6, windowEnd: 10.5 },
  ],
  words,
  logoFile: 'assets/logo_small.png',
  logoAspect: 2,
  outroFile: 'assets/outro_fit.png',
  bgmFile: 'assets/bgm.mp3',
});

assert.equal(comp.mainDurationS, 16);
assert.equal(comp.outroDurationS, 3);
assert.equal(comp.totalDurationS, 19);
const html = comp.html;

assert.ok(html.includes('data-composition-id="main"'), 'composition root');
assert.ok(html.includes('data-width="1080"') && html.includes('data-height="1920"'), 'portrait canvas');
assert.ok(html.includes('data-duration="19"'), 'root duration includes outro');
// avatar base, muted, main duration only
assert.ok(html.includes('id="avatar-full"') && html.includes('data-track-index="0"'), 'avatar base');
// scenes gated to their windows on track 1
assert.ok(html.includes('id="scene-1"') && html.includes('data-start="2"') && html.includes('data-duration="4"'), 'scene 1 window');
assert.ok(html.includes('id="scene-2"') && html.includes('data-start="6"') && html.includes('data-duration="4.5"'), 'scene 2 window');
// one bubble pinned for the whole main video, playing the avatar from t=0
assert.ok(
  /id="bubble"[^>]*data-start="0"[^>]*data-duration="16"[^>]*data-media-start="0"/.test(html),
  'bubble covers the whole main video',
);
// logo only over the main part
assert.ok(/id="logo"[^>]*data-duration="16"/.test(html), 'logo ends before outro');
// captions: first cue text present, uppercase comes from CSS
assert.ok(html.includes('>Stop cracking your own<'), 'first caption cue');
assert.ok(html.includes('text-transform: uppercase'), 'uppercase captions (default template)');
assert.ok(html.includes(`bottom: ${resolveRenderTemplate({}).subtitles.marginVPx}px`), 'caption height from template');
// outro image after the main part
assert.ok(/id="outro"[^>]*data-start="16"/.test(html), 'outro starts at main end');
// audio: voiceover at full volume ending with the main part, bgm ducked and
// running through the outro
assert.ok(/id="voiceover"[^>]*data-duration="16"[^>]*data-volume="1"/.test(html), 'voiceover');
assert.ok(/id="bgm"[^>]*data-duration="19"[^>]*data-volume="0.13"/.test(html), 'ducked bgm through outro');
// one registered paused timeline
assert.ok(html.includes('window.__timelines["main"] = gsap.timeline({ paused: true })'), 'timeline registered');

// bubble disabled -> no bubble clips
const noBubble = buildHfComposition({
  avatarFile: 'assets/avatar.mp4',
  avatarDurationS: 10,
  scenes: [{ file: 'assets/s.mp4', windowStart: 1, windowEnd: 5 }],
  words,
  template: resolveRenderTemplate({ avatarBubble: { enabled: false } }),
});
assert.ok(!noBubble.html.includes('id="bubble"'), 'no bubble when disabled');
assert.ok(!noBubble.html.includes('id="outro"') && !noBubble.html.includes('id="bgm"'), 'optional clips omitted');
assert.equal(noBubble.totalDurationS, 10);

// caption cues past the voiceover end are dropped
const shortMain = buildHfComposition({
  avatarFile: 'assets/avatar.mp4',
  avatarDurationS: 1.5,
  scenes: [],
  words,
});
assert.ok(shortMain.html.includes('id="cap-1"'), 'in-range cue kept');
assert.ok(!shortMain.html.includes('id="cap-3"'), 'cue past main end dropped');

// sidecar project files
const files = hfProjectFiles('vd-x');
assert.deepEqual(files.map((f) => f.path).sort(), ['hyperframes.json', 'meta.json']);
assert.ok(files.every((f) => f.content.endsWith('\n')), 'trailing newline');

console.log('hyperframes.test.ts: all assertions passed');
