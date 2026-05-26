/**
 * Storage adapter for /upload_files.
 *
 * Two backends:
 *
 *   1. S3-compatible (AWS S3, Cloudflare R2, GCS interoperability
 *      mode, Backblaze B2, etc.) — used in production. Driven by
 *      env vars:
 *
 *        S3_BUCKET            (required to enable real uploads)
 *        S3_REGION            (default: us-east-1)
 *        S3_ENDPOINT          (custom endpoint URL for R2/GCS;
 *                              leave blank for AWS)
 *        S3_ACCESS_KEY_ID     (required)
 *        S3_SECRET_ACCESS_KEY (required)
 *        S3_PUBLIC_BASE_URL   (CDN/public host that fronts the
 *                              bucket — e.g. https://cdn.vayil.in)
 *                              If unset we synthesise a virtual-
 *                              host-style URL.
 *        S3_FORCE_PATH_STYLE  ("true" for R2 / GCS / Minio)
 *
 *   2. Dev/local — if `S3_BUCKET` is missing, returns the file
 *      content as a tiny base64 data: URL so callers still get a
 *      shape they can persist. The legacy mobile shim already does
 *      this; keeping the contract identical means routes don't
 *      need to branch.
 *
 * The exported `uploadFile()` is the one routes call; the legacy
 * upload_files multipart handlers wrap it and translate the result
 * into the {filename, url, size, mimetype} array the mobile apps
 * expect.
 */
import { randomUUID } from 'crypto';

export type UploadedFile = {
  field: string;
  filename: string;
  size: number;
  mimetype: string;
  url: string;
  storage: 's3' | 'data-url';
};

interface RawFile {
  fieldname: string;
  originalname: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
}

let s3Singleton: any | null = null;

/** Lazy-load @aws-sdk/client-s3 only when we actually need it. */
async function getS3() {
  if (s3Singleton) return s3Singleton;
  try {
    const { S3Client } = await import('@aws-sdk/client-s3');
    const region   = process.env.S3_REGION || 'us-east-1';
    const endpoint = process.env.S3_ENDPOINT || undefined;
    s3Singleton = new S3Client({
      region,
      endpoint,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
      credentials: {
        accessKeyId:     process.env.S3_ACCESS_KEY_ID!,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
      },
    });
    return s3Singleton;
  } catch (err) {
    // Module not installed yet — fall back to dev mode.
    return null;
  }
}

function isS3Configured(): boolean {
  return Boolean(
    process.env.S3_BUCKET &&
    process.env.S3_ACCESS_KEY_ID &&
    process.env.S3_SECRET_ACCESS_KEY,
  );
}

function publicUrlFor(key: string): string {
  if (process.env.S3_PUBLIC_BASE_URL) {
    const base = process.env.S3_PUBLIC_BASE_URL.replace(/\/$/, '');
    return `${base}/${key}`;
  }
  const bucket = process.env.S3_BUCKET!;
  const region = process.env.S3_REGION || 'us-east-1';
  const endpoint = process.env.S3_ENDPOINT;
  if (endpoint) {
    return `${endpoint.replace(/\/$/, '')}/${bucket}/${key}`;
  }
  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
}

/** Sanitise a filename so it's safe to use as part of a key. */
function safeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 80);
}

export async function uploadFile(
  file: RawFile,
  opts: { prefix?: string } = {},
): Promise<UploadedFile> {
  const prefix = (opts.prefix || 'uploads').replace(/^\/|\/$/g, '');
  const key = `${prefix}/${new Date().toISOString().slice(0, 10)}/${randomUUID()}-${safeFileName(file.originalname)}`;

  if (isS3Configured()) {
    const s3 = await getS3();
    if (s3) {
      const { PutObjectCommand } = await import('@aws-sdk/client-s3');
      await s3.send(new PutObjectCommand({
        Bucket: process.env.S3_BUCKET!,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
        ACL: process.env.S3_PUBLIC_ACL as any || undefined,
      }));
      return {
        field: file.fieldname,
        filename: file.originalname,
        size: file.size,
        mimetype: file.mimetype,
        url: publicUrlFor(key),
        storage: 's3',
      };
    }
  }

  // Dev fallback — short base64 preview so the upload contract round-
  // trips without an external storage dep. Truncated heavily to keep
  // response bodies small.
  return {
    field: file.fieldname,
    filename: file.originalname,
    size: file.size,
    mimetype: file.mimetype,
    url: `data:${file.mimetype};base64,${file.buffer.toString('base64').slice(0, 32)}…`,
    storage: 'data-url',
  };
}

export async function uploadFiles(files: RawFile[], opts: { prefix?: string } = {}): Promise<UploadedFile[]> {
  return Promise.all(files.map(f => uploadFile(f, opts)));
}
