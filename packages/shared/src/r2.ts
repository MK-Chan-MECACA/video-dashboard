import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicBaseUrl: string; // no trailing slash
}

export function r2ConfigFromEnv(env: Record<string, string | undefined> = process.env): R2Config {
  const required = (k: string) => {
    const v = env[k];
    if (!v) throw new Error(`Missing env var ${k}`);
    return v;
  };
  return {
    accountId: required('R2_ACCOUNT_ID'),
    accessKeyId: required('R2_ACCESS_KEY_ID'),
    secretAccessKey: required('R2_SECRET_ACCESS_KEY'),
    bucket: required('R2_BUCKET'),
    publicBaseUrl: required('R2_PUBLIC_BASE_URL').replace(/\/$/, ''),
  };
}

export class R2Client {
  private s3: S3Client;

  constructor(private cfg: R2Config) {
    this.s3 = new S3Client({
      region: 'auto',
      endpoint: `https://${cfg.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: cfg.accessKeyId,
        secretAccessKey: cfg.secretAccessKey,
      },
    });
  }

  publicUrl(key: string): string {
    return `${this.cfg.publicBaseUrl}/${key.split('/').map(encodeURIComponent).join('/')}`;
  }

  async put(key: string, body: Uint8Array | Buffer | string, contentType: string): Promise<void> {
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.cfg.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }

  /** Download a remote URL (HeyGen/WaveSpeed output) straight into R2. */
  async putFromUrl(key: string, url: string, fallbackContentType: string): Promise<number> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Fetch ${url} failed: ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    await this.put(key, buf, res.headers.get('content-type') ?? fallbackContentType);
    return buf.length;
  }

  async getBytes(key: string): Promise<Buffer> {
    const res = await this.s3.send(
      new GetObjectCommand({ Bucket: this.cfg.bucket, Key: key }),
    );
    const bytes = await res.Body?.transformToByteArray();
    if (!bytes) throw new Error(`R2 get ${key}: empty body`);
    return Buffer.from(bytes);
  }

  async delete(key: string): Promise<void> {
    await this.s3.send(new DeleteObjectCommand({ Bucket: this.cfg.bucket, Key: key }));
  }

  /** Presigned GET — for serving private inputs to WaveSpeed without making them public. */
  presignGet(key: string, expiresInS = 3600 * 6): Promise<string> {
    return getSignedUrl(
      this.s3,
      new GetObjectCommand({ Bucket: this.cfg.bucket, Key: key }),
      { expiresIn: expiresInS },
    );
  }

  /** Presigned PUT — for direct browser uploads of brand assets. */
  presignPut(key: string, contentType: string, expiresInS = 600): Promise<string> {
    return getSignedUrl(
      this.s3,
      new PutObjectCommand({ Bucket: this.cfg.bucket, Key: key, ContentType: contentType }),
      { expiresIn: expiresInS },
    );
  }
}
