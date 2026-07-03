const BASE = 'https://services.leadconnectorhq.com';
const VERSION = '2021-07-28';

export interface GhlSocialAccount {
  id: string;
  platform: string;
  name?: string;
  avatar?: string;
}

export interface GhlPost {
  id: string;
  status: string;
  scheduleDate?: string;
}

export class GhlClient {
  constructor(
    private token: string,
    private locationId: string,
  ) {}

  private headers() {
    return {
      Authorization: `Bearer ${this.token}`,
      Version: VERSION,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
  }

  async listAccounts(): Promise<GhlSocialAccount[]> {
    const res = await fetch(
      `${BASE}/social-media-posting/${this.locationId}/accounts`,
      { headers: this.headers() },
    );
    if (!res.ok) throw new Error(`GHL listAccounts ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as { results?: { accounts?: GhlSocialAccount[] } };
    return json.results?.accounts ?? [];
  }

  /** Schedule a TikTok post. mediaUrl must be publicly fetchable (R2 public URL). */
  async schedulePost(opts: {
    accountId: string;
    userId: string;
    caption: string;
    mediaUrl: string;
    scheduleDate: string; // ISO
  }): Promise<string> {
    if (opts.caption.length > 2200) {
      throw new Error(`Caption too long for TikTok: ${opts.caption.length} > 2200`);
    }
    const res = await fetch(`${BASE}/social-media-posting/${this.locationId}/posts`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        accountIds: [opts.accountId],
        userId: opts.userId,
        type: 'post',
        status: 'scheduled',
        summary: opts.caption,
        scheduleDate: opts.scheduleDate,
        media: [{ url: opts.mediaUrl }],
        // followUpComment intentionally omitted — not allowed for TikTok
      }),
    });
    if (!res.ok) throw new Error(`GHL schedulePost ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as {
      results?: { post?: { _id?: string; id?: string } };
      post?: { _id?: string; id?: string };
      id?: string;
    };
    const id =
      json.results?.post?._id ??
      json.results?.post?.id ??
      json.post?._id ??
      json.post?.id ??
      json.id;
    if (!id) throw new Error(`GHL schedulePost: no post id: ${JSON.stringify(json).slice(0, 300)}`);
    return String(id);
  }

  async getPost(postId: string): Promise<GhlPost> {
    const res = await fetch(
      `${BASE}/social-media-posting/${this.locationId}/posts/${postId}`,
      { headers: this.headers() },
    );
    if (!res.ok) throw new Error(`GHL getPost ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as { results?: { post?: Record<string, unknown> }; post?: Record<string, unknown> };
    const p = (json.results?.post ?? json.post ?? {}) as Record<string, unknown>;
    return {
      id: String(p._id ?? p.id ?? postId),
      status: String(p.status ?? 'unknown'),
      scheduleDate: p.scheduleDate ? String(p.scheduleDate) : undefined,
    };
  }
}
