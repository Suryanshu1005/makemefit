import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { IStorageService, UploadFileParams, UploadFileResult, GetFileResult } from './storage.interface';
import { NotFoundError, AppError } from '../errors/app-error';

export class LocalStorageService implements IStorageService {
  private baseStorageDir: string;

  constructor(baseDir?: string) {
    // Defaults to .storage/food-images relative to API root
    this.baseStorageDir = baseDir || path.resolve(process.cwd(), '.storage', 'food-images');
  }

  private resolveSafePath(storageKey: string): string {
    // Normalize and sanitize key to prevent path traversal
    const safeKey = storageKey.replace(/^[/\\]+/, '');
    const fullPath = path.resolve(this.baseStorageDir, safeKey);

    if (!fullPath.startsWith(this.baseStorageDir)) {
      throw new AppError('Attempted path traversal outside storage directory', 400, 'INVALID_PATH');
    }

    return fullPath;
  }

  public async uploadFile(params: UploadFileParams): Promise<UploadFileResult> {
    const ext = path.extname(params.fileName) || '.jpg';
    const uniqueId = crypto.randomUUID();
    const safeExt = ext.toLowerCase().replace(/[^a-z0-9.]/g, '');
    const storageKey = `${params.userId}/${uniqueId}${safeExt}`;

    const filePath = this.resolveSafePath(storageKey);
    const dir = path.dirname(filePath);

    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(filePath, params.buffer);

    return {
      storageKey,
      sizeBytes: params.buffer.length,
    };
  }

  public async getFile(storageKey: string): Promise<GetFileResult> {
    const filePath = this.resolveSafePath(storageKey);

    try {
      const buffer = await fs.readFile(filePath);
      // Determine mime type from extension
      const ext = path.extname(filePath).toLowerCase();
      let mimeType = 'application/octet-stream';
      if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
      else if (ext === '.png') mimeType = 'image/png';
      else if (ext === '.webp') mimeType = 'image/webp';
      else if (ext === '.heic') mimeType = 'image/heic';
      else if (ext === '.heif') mimeType = 'image/heif';

      return {
        buffer,
        mimeType,
      };
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        throw new NotFoundError(`Stored file "${storageKey}" was not found.`);
      }
      throw err;
    }
  }

  public async deleteFile(storageKey: string): Promise<void> {
    const filePath = this.resolveSafePath(storageKey);
    try {
      await fs.unlink(filePath);
    } catch (err: any) {
      if (err.code !== 'ENOENT') {
        throw err;
      }
    }
  }

  public async exists(storageKey: string): Promise<boolean> {
    const filePath = this.resolveSafePath(storageKey);
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}

// Global default storage service singleton
export const storageService: IStorageService = new LocalStorageService();
