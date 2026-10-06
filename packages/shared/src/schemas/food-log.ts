import { z } from 'zod';

export const ProcessingStatusEnum = z.enum([
  'pending',
  'uploading',
  'uploaded',
  'analyzing',
  'completed',
  'needs_review',
  'failed',
]);

export type ProcessingStatus = z.infer<typeof ProcessingStatusEnum>;

export const FoodLogUploadResponseSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  originalFileName: z.string(),
  mimeType: z.string(),
  fileSizeBytes: z.number().int().nonnegative(),
  processingStatus: ProcessingStatusEnum,
  imageUrl: z.string(),
  createdAt: z.string(),
  errorMessage: z.string().nullable().optional(),
});

export type FoodLogUploadResponse = z.infer<typeof FoodLogUploadResponseSchema>;
