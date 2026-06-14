/**
 * imageValidation.ts — v4.5.28
 *
 * Server-side validation that mirrors the rules enforced by the web
 * ProfileImageUploader component. Mobile (Flutter) uploads bypass the
 * React component entirely, so the backend has to apply the same caps
 * itself — otherwise a misbehaving mobile build can store 20 MB images
 * or 32×32 thumbnails into S3.
 *
 * Rules (kept in sync with src/components/shared/ProfileImageUploader.tsx):
 *   - type:           image/jpeg | image/png | image/webp
 *   - max byte size:  5 MB
 *   - min dimension:  256 × 256 px
 *   - max dimension:  4096 × 4096 px
 *
 * Dimensions are read from the file's own header bytes (no decode of
 * the pixel data) so the validation is O(1) regardless of image size.
 * Supports the three accepted formats.
 */
import { ApiError } from './http';

const ACCEPTED = new Set(['image/jpeg', 'image/png', 'image/webp']);
export const MAX_BYTES     = 5 * 1024 * 1024;
export const MIN_DIMENSION = 256;
export const MAX_DIMENSION = 4096;

export interface ImageDims { width: number; height: number; }

/** Throws ApiError(400, …) if the file is not an acceptable image for a
 *  profile photo. Returns parsed dimensions on success. */
export function validateProfileImage(file: { mimetype: string; size: number; buffer: Buffer; originalname?: string }): ImageDims {
  if (!ACCEPTED.has(file.mimetype)) {
    throw new ApiError(400, `Unsupported image type. Use JPG, PNG, or WebP. (Got "${file.mimetype}".)`);
  }
  if (file.size > MAX_BYTES) {
    const mb = (file.size / 1024 / 1024).toFixed(1);
    throw new ApiError(400, `Image is too large — ${mb} MB. Maximum is 5 MB.`);
  }
  const dims = readImageDimensions(file.mimetype, file.buffer);
  if (!dims) {
    throw new ApiError(400, 'Could not read this image. The file may be corrupted.');
  }
  if (dims.width < MIN_DIMENSION || dims.height < MIN_DIMENSION) {
    throw new ApiError(400,
      `Image is too small — ${dims.width}×${dims.height}. Minimum is ${MIN_DIMENSION}×${MIN_DIMENSION} px.`);
  }
  if (dims.width > MAX_DIMENSION || dims.height > MAX_DIMENSION) {
    throw new ApiError(400,
      `Image is too large — ${dims.width}×${dims.height}. Maximum is ${MAX_DIMENSION}×${MAX_DIMENSION} px.`);
  }
  return dims;
}

/* Header parsers — return null if the buffer doesn't match the format
 * we'd expect for that mime. */
function readImageDimensions(mime: string, buf: Buffer): ImageDims | null {
  try {
    if (mime === 'image/png')  return readPng(buf);
    if (mime === 'image/jpeg') return readJpeg(buf);
    if (mime === 'image/webp') return readWebp(buf);
  } catch { /* fall through */ }
  return null;
}

function readPng(buf: Buffer): ImageDims | null {
  // PNG signature: 89 50 4E 47 0D 0A 1A 0A
  if (buf.length < 24) return null;
  if (buf[0] !== 0x89 || buf[1] !== 0x50 || buf[2] !== 0x4E || buf[3] !== 0x47) return null;
  // IHDR is the first chunk after the signature. width @ offset 16, height @ 20.
  const width  = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  return { width, height };
}

function readJpeg(buf: Buffer): ImageDims | null {
  // JPEG: scan for SOFn markers (0xFFC0..0xFFCF except C4/C8/CC) and read the dimensions from there.
  if (buf.length < 4 || buf[0] !== 0xFF || buf[1] !== 0xD8) return null;
  let offset = 2;
  while (offset < buf.length) {
    if (buf[offset] !== 0xFF) return null;
    let marker = buf[offset + 1];
    offset += 2;
    // Skip fill bytes
    while (marker === 0xFF) { marker = buf[offset++]; }
    // Start Of Frame markers
    if (marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) {
      // segLen (2 bytes), precision (1 byte), height (2 bytes), width (2 bytes)
      const height = buf.readUInt16BE(offset + 3);
      const width  = buf.readUInt16BE(offset + 5);
      return { width, height };
    }
    // Skip this segment
    if (offset + 2 > buf.length) return null;
    const segLen = buf.readUInt16BE(offset);
    offset += segLen;
  }
  return null;
}

function readWebp(buf: Buffer): ImageDims | null {
  // WebP: "RIFF....WEBPVP8[ L|X]..."
  if (buf.length < 30) return null;
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') return null;
  const chunk = buf.toString('ascii', 12, 16);
  if (chunk === 'VP8 ') {
    // Lossy: dims at offset 26 (14 bits each, little-endian, low 14 bits)
    const width  = buf.readUInt16LE(26) & 0x3FFF;
    const height = buf.readUInt16LE(28) & 0x3FFF;
    return { width, height };
  }
  if (chunk === 'VP8L') {
    // Lossless: bits packed at offset 21..25
    const b0 = buf[21]; const b1 = buf[22]; const b2 = buf[23]; const b3 = buf[24];
    const width  = 1 + ((b1 & 0x3F) << 8 | b0);
    const height = 1 + ((b3 & 0x0F) << 10 | b2 << 2 | (b1 & 0xC0) >> 6);
    return { width, height };
  }
  if (chunk === 'VP8X') {
    // Extended: dims at offset 24 (3 bytes each, little-endian, value+1)
    const width  = 1 + (buf[24] | buf[25] << 8 | buf[26] << 16);
    const height = 1 + (buf[27] | buf[28] << 8 | buf[29] << 16);
    return { width, height };
  }
  return null;
}
