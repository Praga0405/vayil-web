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
import axios from 'axios';
import FormData from 'form-data';
import { randomUUID } from 'crypto';

export type UploadedFile = {
  field: string;
  filename: string;
  size: number;
  mimetype: string;
  url: string;
  storage: 's3' | 'legacy' | 'data-url';
};

interface RawFile {
  fieldname: string;
  originalname: string;
  mimetype: string;
  buffer: Buffer;
  size: number;
}

let s3Singleton: any | null = null;

function env(...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key];
    if (value) return value;
  }
  return undefined;
}

/** Lazy-load @aws-sdk/client-s3 only when we actually need it. */
async function getS3() {
  if (s3Singleton) return s3Singleton;
  try {
    const { S3Client } = await import('@aws-sdk/client-s3');
    const region   = env('S3_REGION', 'AWS_S3_REGION', 'AWS_REGION', 'AWS_DEFAULT_REGION') || 'us-east-1';
    const endpoint = env('S3_ENDPOINT', 'AWS_S3_ENDPOINT') || undefined;
    s3Singleton = new S3Client({
      region,
      endpoint,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
      credentials: {
        accessKeyId:     env('S3_ACCESS_KEY_ID', 'AWS_S3_ACCESS_KEY_ID', 'S3_ACCESS_KEY', 'AWS_ACCESS_KEY', 'AWS_ACCESS_KEY_ID')!,
        secretAccessKey: env('S3_SECRET_ACCESS_KEY', 'AWS_S3_SECRET_ACCESS_KEY', 'S3_SECRET_KEY', 'AWS_SECRET_KEY', 'AWS_SECRET_ACCESS_KEY')!,
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
    env('S3_BUCKET', 'S3_BUCKET_NAME', 'AWS_S3_BUCKET', 'AWS_S3_BUCKET_NAME', 'AWS_BUCKET', 'AWS_BUCKET_NAME') &&
    env('S3_ACCESS_KEY_ID', 'AWS_S3_ACCESS_KEY_ID', 'S3_ACCESS_KEY', 'AWS_ACCESS_KEY', 'AWS_ACCESS_KEY_ID') &&
    env('S3_SECRET_ACCESS_KEY', 'AWS_S3_SECRET_ACCESS_KEY', 'S3_SECRET_KEY', 'AWS_SECRET_KEY', 'AWS_SECRET_ACCESS_KEY'),
  );
}

function publicUrlFor(key: string): string {
  const publicBaseUrl = env('S3_PUBLIC_BASE_URL', 'AWS_S3_PUBLIC_BASE_URL', 'AWS_CLOUDFRONT_URL');
  if (publicBaseUrl) {
    const base = publicBaseUrl.replace(/\/$/, '');
    return `${base}/${key}`;
  }
  const bucket = env('S3_BUCKET', 'S3_BUCKET_NAME', 'AWS_S3_BUCKET', 'AWS_S3_BUCKET_NAME', 'AWS_BUCKET', 'AWS_BUCKET_NAME')!;
  const region = env('S3_REGION', 'AWS_S3_REGION', 'AWS_REGION', 'AWS_DEFAULT_REGION') || 'us-east-1';
  const endpoint = env('S3_ENDPOINT', 'AWS_S3_ENDPOINT');
  if (endpoint) {
    return `${endpoint.replace(/\/$/, '')}/${bucket}/${key}`;
  }
  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
}

/** Sanitise a filename so it's safe to use as part of a key. */
function safeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 80);
}

async function uploadViaLegacyEndpoint(file: RawFile): Promise<UploadedFile | null> {
  if (process.env.DISABLE_LEGACY_UPLOAD_FALLBACK === 'true') return null;

  const url = process.env.LEGACY_UPLOAD_URL || 'https://app.vayil.in/upload_files';
  const form = new FormData();
  const field = file.fieldname || 'upload_files';
  form.append(field, file.buffer, {
    filename: safeFileName(file.originalname),
    contentType: file.mimetype,
    knownLength: file.size,
  });

  const response = await axios.post(url, form, {
    headers: form.getHeaders(),
    maxBodyLength: Infinity,
    timeout: 30_000,
  });
  const uploadedUrls = response.data?.uploadedUrls || {};
  const uploadedUrl =
    uploadedUrls[field]?.[0] ||
    uploadedUrls.upload_files?.[0] ||
    uploadedUrls.files?.[0];
  if (!uploadedUrl) return null;

  return {
    field,
    filename: file.originalname,
    size: file.size,
    mimetype: file.mimetype,
    url: uploadedUrl,
    storage: 'legacy',
  };
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
        Bucket: env('S3_BUCKET', 'S3_BUCKET_NAME', 'AWS_S3_BUCKET', 'AWS_S3_BUCKET_NAME', 'AWS_BUCKET', 'AWS_BUCKET_NAME')!,
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

  const legacyUploaded = await uploadViaLegacyEndpoint(file);
  if (legacyUploaded) return legacyUploaded;

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

export function legacyUploadResponse(files: UploadedFile[]) {
  const urls = files.map((file) => file.url).filter(Boolean);
  const uploadedUrls = files.reduce<Record<string, string[]>>((acc, file) => {
    const key = file.field || 'upload_files';
    acc[key] = acc[key] || [];
    acc[key].push(file.url);
    return acc;
  }, {});

  if (!uploadedUrls.upload_files) uploadedUrls.upload_files = urls;
  if (!uploadedUrls.files) uploadedUrls.files = urls;

  return {
    message: 'Files uploaded successfully',
    uploadedUrls,
  };
}
