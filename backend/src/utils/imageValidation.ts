/**
 * imageValidation.ts — v4.5.28
 *
 * Server-side validation that mirrors the rules enforced by the web
 * ProfileImageUploader component. Mobile (Flutter) uploads bypass the
 * React component entirely, so the backend has to apply the same caps
 * itself — otherwise a misbehaving mobile build can store 20 MB images
 * into S3.
 *
 * Rules (kept in sync with src/components/shared/ProfileImageUploader.tsx):
 *   - type:          image/jpeg | image/png | image/webp
 *   - max byte size: 5 MB
 *
 * Resolution (min/max dimensions) is intentionally NOT enforced —
 * avatars render at fixed CSS sizes so any usable image works, and we
 * don't want to reject low-res phone-camera uploads.
 */
import { ApiError } from './http';

const ACCEPTED = new Set(['image/jpeg', 'image/png', 'image/webp']);
export const MAX_BYTES = 5 * 1024 * 1024;

/** Throws ApiError(400, …) if the file is not an acceptable image for a
 *  profile photo. Returns void on success. */
export function validateProfileImage(file: { mimetype: string; size: number; originalname?: string }): void {
  if (!ACCEPTED.has(file.mimetype)) {
    throw new ApiError(400, `Unsupported image type. Use JPG, PNG, or WebP. (Got "${file.mimetype}".)`);
  }
  if (file.size > MAX_BYTES) {
    const mb = (file.size / 1024 / 1024).toFixed(1);
    throw new ApiError(400, `Image is too large — ${mb} MB. Maximum is 5 MB.`);
  }
}
