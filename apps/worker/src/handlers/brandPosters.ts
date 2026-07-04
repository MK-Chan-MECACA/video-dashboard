import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { r2 } from '../clients';
import { db, type BrandAsset } from '../db';
import { runFfmpeg } from '../render/exec';

const VIDEO_RE = /\.(mp4|mov|webm)$/i;

/**
 * The dashboard's layout preview can't rely on the browser decoding the raw
 * avatar reference (e.g. 10-bit H.264 from an iPhone has no decoder in
 * Safari), so it prefers a poster frame. Extract one JPEG per video avatar
 * reference and record it in meta.poster_key — the periodic scan self-heals
 * new uploads on the next pass.
 */
export async function generateMissingBrandPosters(): Promise<void> {
  const s = db();
  const assets = await s<BrandAsset[]>`
    select * from brand_assets
    where kind = 'avatar_reference' and meta->>'poster_key' is null`;

  for (const asset of assets.filter((a) => VIDEO_RE.test(a.name))) {
    try {
      const posterKey = `${asset.r2_key}.poster.jpg`;
      const dir = await mkdtemp(join(tmpdir(), 'brand-poster-'));
      try {
        const src = join(dir, 'src');
        const out = join(dir, 'poster.jpg');
        await writeFile(src, await r2().getBytes(asset.r2_key));
        // Frame at 0.1s to match the preview's #t=0.1; 720w keeps it light.
        await runFfmpeg([
          '-y', '-ss', '0.1', '-i', src,
          '-frames:v', '1', '-vf', 'scale=720:-2', '-q:v', '3', out,
        ]);
        await r2().put(posterKey, await readFile(out), 'image/jpeg');
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
      await s`
        update brand_assets set meta = meta || ${s.json({ poster_key: posterKey })}
        where id = ${asset.id}`;
      console.log(`[posters] generated ${posterKey}`);
    } catch (err) {
      console.error(`[posters] failed for brand asset ${asset.id} (${asset.name}):`, err);
    }
  }
}
