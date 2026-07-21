import assert from 'node:assert';
import { canTransition } from '@vd/shared';

// Regeneration loop: a finished video must be able to go back through
// generation (voice/avatar/scenes) and re-render after a script edit.
for (const from of ['video_review', 'video_changes_requested', 'approved'] as const) {
  for (const to of [
    'voice_generating',
    'avatar_generating',
    'scenes_generating',
    'rendering',
  ] as const) {
    assert(canTransition(from, to), `expected ${from} -> ${to} to be allowed`);
  }
}

// One-click "save + regenerate video" from the script states.
assert(canTransition('script_review', 'voice_generating'));
assert(canTransition('script_changes_requested', 'voice_generating'));

// The regen cascade rides the normal pipeline back to review.
assert(canTransition('voice_generating', 'avatar_generating'));
assert(canTransition('avatar_generating', 'rendering'));
assert(canTransition('rendering', 'video_review'));

// Published/scheduled stay closed — the GHL post references the old render.
assert(!canTransition('scheduled', 'voice_generating'));
assert(!canTransition('posted', 'voice_generating'));
assert(!canTransition('posted', 'rendering'));

console.log('pipeline.test.ts: all assertions passed');
