export interface UploadFileParams {
  userId: string;
  buffer: Buffer;
  fileName: string;
  mimeType: string;
}

export interface UploadFileResult {
  storageKey: string;
  sizeBytes: number;
}

export interface GetFileResult {
  buffer: Buffer;
  mimeType: string;
}

export interface IStorageService {
  uploadFile(params: UploadFileParams): Promise<UploadFileResult>;
  getFile(storageKey: string): Promise<GetFileResult>;
  deleteFile(storageKey: string): Promise<void>;
  exists(storageKey: string): Promise<boolean>;
}
