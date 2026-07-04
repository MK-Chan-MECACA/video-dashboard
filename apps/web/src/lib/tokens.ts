import { createHash, randomBytes } from 'node:crypto';

export function newReviewToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashToken(token) };
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Mint a new API key. The full key is returned once; only the hash is stored. */
export function newApiKey(): { key: string; keyHash: string; keyPrefix: string } {
  const key = `ttm_live_${randomBytes(32).toString('base64url')}`;
  return { key, keyHash: hashToken(key), keyPrefix: key.slice(0, 16) };
}
