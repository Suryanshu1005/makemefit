export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

export const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
];

export interface FileValidationResult {
  isValid: boolean;
  error?: string;
  fileSizeBytes: number;
  mimeType: string;
  fileName: string;
  previewUrl?: string;
}

/**
 * Validates the file's first 12 bytes against known image magic signatures.
 */
export async function validateClientMagicBytes(file: File): Promise<boolean> {
  if (file.size < 12) return false;

  const headerSlice = await file.slice(0, 12).arrayBuffer();
  const bytes = new Uint8Array(headerSlice);

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return true;
  }

  // PNG: 89 50 4E 47
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return true;
  }

  // WebP: 'RIFF' at 0, 'WEBP' at 8
  const textDecoder = new TextDecoder('ascii');
  const riff = textDecoder.decode(bytes.subarray(0, 4));
  const webp = textDecoder.decode(bytes.subarray(8, 12));
  if (riff === 'RIFF' && webp === 'WEBP') {
    return true;
  }

  // HEIC/HEIF: 'ftyp' at 4
  const ftyp = textDecoder.decode(bytes.subarray(4, 8));
  if (ftyp === 'ftyp') {
    return true;
  }

  return false;
}

/**
 * Checks if the browser can successfully decode the image into a valid graphic.
 */
export function testImageDecode(objectUrl: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        resolve(true);
      } else {
        resolve(false);
      }
    };
    img.onerror = () => resolve(false);
    img.src = objectUrl;
  });
}

/**
 * Performs full client-side validation on an uploaded file.
 */
export async function validateClientImage(file: File): Promise<FileValidationResult> {
  const baseResult = {
    fileSizeBytes: file.size,
    mimeType: file.type || 'application/octet-stream',
    fileName: file.name,
  };

  // 1. Empty file
  if (!file || file.size === 0) {
    return {
      ...baseResult,
      isValid: false,
      error: 'The selected file is empty (0 bytes). Please choose a valid photo.',
    };
  }

  // 2. Max size
  if (file.size > MAX_FILE_SIZE_BYTES) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
    return {
      ...baseResult,
      isValid: false,
      error: `File size (${sizeMb} MB) exceeds maximum allowed limit of 10 MB.`,
    };
  }

  // 3. MIME type
  const normalizedType = file.type.toLowerCase();
  const hasValidExtension = /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name);
  const isValidMime = ALLOWED_IMAGE_TYPES.includes(normalizedType) || (normalizedType === '' && hasValidExtension);

  if (!isValidMime) {
    return {
      ...baseResult,
      isValid: false,
      error: 'Unsupported format. Allowed formats: JPEG, PNG, WebP, and HEIC.',
    };
  }

  // 4. Magic bytes signature inspection
  const hasValidMagicBytes = await validateClientMagicBytes(file);
  if (!hasValidMagicBytes) {
    return {
      ...baseResult,
      isValid: false,
      error: 'Corrupted or spoofed image. The file contents do not match a valid image format.',
    };
  }

  // 5. Image decode verification (for JPEG/PNG/WebP where browser natively decodes)
  const isHeic = normalizedType.includes('heic') || normalizedType.includes('heif') || /\.hei[cf]$/i.test(file.name);
  const objectUrl = URL.createObjectURL(file);

  if (!isHeic) {
    const canDecode = await testImageDecode(objectUrl);
    if (!canDecode) {
      URL.revokeObjectURL(objectUrl);
      return {
        ...baseResult,
        isValid: false,
        error: 'Corrupted image data. The browser was unable to decode the image picture.',
      };
    }
  }

  return {
    ...baseResult,
    isValid: true,
    previewUrl: objectUrl,
  };
}
