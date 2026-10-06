import { ValidationError } from '../errors/app-error';

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 Megabytes

export const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

/**
 * Validates image buffer magic bytes against common photographic formats:
 * - JPEG: FF D8 FF
 * - PNG: 89 50 4E 47
 * - WebP: RIFF ... WEBP
 * - HEIC/HEIF: .... ftyp
 */
export function validateImageSignature(buffer: Buffer): boolean {
  if (buffer.length < 12) {
    return false;
  }

  // JPEG signature: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return true;
  }

  // PNG signature: 89 50 4E 47 (137 80 78 71)
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return true;
  }

  // WebP signature: RIFF at byte 0, WEBP at byte 8
  if (
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return true;
  }

  // HEIC/HEIF signature: ftyp box at byte 4
  if (buffer.subarray(4, 8).toString('ascii') === 'ftyp') {
    return true;
  }

  return false;
}

export function validateImageFile(buffer: Buffer, mimeType: string, fileName: string) {
  // 1. Check empty file
  if (!buffer || buffer.length === 0) {
    throw new ValidationError('Uploaded image file is empty (0 bytes).');
  }

  // 2. Check maximum size
  if (buffer.length > MAX_FILE_SIZE_BYTES) {
    const sizeMb = (buffer.length / (1024 * 1024)).toFixed(2);
    throw new ValidationError(
      `File size (${sizeMb} MB) exceeds maximum allowed limit of 10 MB.`
    );
  }

  // 3. Check declared MIME type
  const normalizedMime = mimeType.toLowerCase();
  if (!ALLOWED_MIME_TYPES.has(normalizedMime)) {
    throw new ValidationError(
      `Unsupported file type "${mimeType}". Allowed formats are JPEG, PNG, WebP, and HEIC.`
    );
  }

  // 4. Server-side content inspection (Magic byte signature)
  if (!validateImageSignature(buffer)) {
    throw new ValidationError(
      'Corrupted or invalid image file content. File bytes do not match declared image format.'
    );
  }
}
