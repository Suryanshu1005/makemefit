import { z } from 'zod';

export const ApiErrorDetailSchema = z.object({
  code: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
});

export type ApiErrorDetail = z.infer<typeof ApiErrorDetailSchema>;

export function createApiResponseSchema<T extends z.ZodTypeAny>(dataSchema: T) {
  return z.object({
    success: z.boolean(),
    data: dataSchema.nullable(),
    error: ApiErrorDetailSchema.nullable(),
    meta: z.object({
      timestamp: z.string(),
    }),
  });
}
