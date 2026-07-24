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
  accountIds?: string[];
  createdBy?: string;
  media?: { url: string; type?: string }[];
  deleted?: boolean;
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

  /**
   * Upload a file into the GHL media library and return its CDN URL.
   * TikTok only accepts post media pulled from domains verified with GHL's
   * TikTok app, so external URLs (e.g. r2.dev) must be re-hosted here first.
   */
  async uploadMedia(name: string, data: Uint8Array, contentType: string): Promise<string> {
    const form = new FormData();
    // Copy to a plain ArrayBuffer: Node Buffers are offset views typed as
    // Uint8Array<ArrayBufferLike>, which DOM lib's BlobPart rejects.
    const bytes = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
    form.append('file', new Blob([bytes], { type: contentType }), name);
    form.append('name', name);
    const res = await fetch(`${BASE}/medias/upload-file`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.token}`,
        Version: VERSION,
        Accept: 'application/json',
        // no Content-Type — fetch sets the multipart boundary
      },
      body: form,
    });
    if (!res.ok) throw new Error(`GHL uploadMedia ${res.status}: ${await res.text()}`);
    const json = (await res.json()) as { url?: string };
    if (!json.url) throw new Error(`GHL uploadMedia: no url in response`);
    return json.url;
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

  /**
   * Full post body — both create (POST) and edit (PUT) need the complete
   * payload: GHL's PUT 422s without accountIds/userId/media, and its backend
   * dereferences media.type and tiktokPostDetails ("undefined.toLowerCase"
   * 400) despite the schema marking them optional.
   */
  private postBody(opts: {
    accountIds: string[];
    userId: string;
    caption: string;
    mediaUrl: string;
    scheduleDate: string;
  }) {
    if (opts.caption.length > 2200) {
      // 2200 is TikTok's limit, the strictest of the supported platforms.
      throw new Error(`Caption too long: ${opts.caption.length} > 2200`);
    }
    return {
      accountIds: opts.accountIds,
      userId: opts.userId,
      type: 'post',
      status: 'scheduled',
      summary: opts.caption,
      scheduleDate: opts.scheduleDate,
      media: [
        {
          url: opts.mediaUrl,
          type: opts.mediaUrl.toLowerCase().endsWith('.mp4') ? 'video/mp4' : 'image/png',
        },
      ],
      tiktokPostDetails: {
        privacyLevel: 'PUBLIC_TO_EVERYONE',
        enableComment: true,
        enableDuet: false,
        enableStitch: false,
        promoteOtherBrand: false,
        promoteYourBrand: false,
        videoDisclosure: false,
      },
      // followUpComment intentionally omitted — not allowed for TikTok
    };
  }

  /**
   * Schedule a post to one or more connected social accounts (TikTok,
   * Instagram, Facebook, YouTube, ...). mediaUrl must be publicly fetchable
   * (R2 public URL).
   */
  async schedulePost(opts: {
    accountIds: string[];
    userId: string;
    caption: string;
    mediaUrl: string;
    scheduleDate: string; // ISO
  }): Promise<string> {
    const res = await fetch(`${BASE}/social-media-posting/${this.locationId}/posts`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(this.postBody(opts)),
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

  /**
   * Update the caption and/or schedule time of an existing scheduled post.
   * GHL's PUT requires the full post body, so callers must pass everything.
   */
  async updatePost(
    postId: string,
    opts: {
      accountIds: string[];
      userId: string;
      caption: string;
      mediaUrl: string;
      scheduleDate: string; // ISO
    },
  ): Promise<void> {
    const res = await fetch(
      `${BASE}/social-media-posting/${this.locationId}/posts/${postId}`,
      {
        method: 'PUT',
        headers: this.headers(),
        body: JSON.stringify({ ...this.postBody(opts), scheduleTimeUpdated: true }),
      },
    );
    if (!res.ok) throw new Error(`GHL updatePost ${res.status}: ${await res.text()}`);
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
      accountIds: Array.isArray(p.accountIds) ? p.accountIds.map(String) : undefined,
      createdBy: p.createdBy ? String(p.createdBy) : undefined,
      media: Array.isArray(p.media)
        ? (p.media as { url: string; type?: string }[])
        : undefined,
      deleted: p.deleted === true,
    };
  }

  /** Delete a post (scheduled or failed). Publishing that already happened is unaffected. */
  async deletePost(postId: string): Promise<void> {
    const res = await fetch(
      `${BASE}/social-media-posting/${this.locationId}/posts/${postId}`,
      { method: 'DELETE', headers: this.headers() },
    );
    if (!res.ok) throw new Error(`GHL deletePost ${res.status}: ${await res.text()}`);
  }
}
