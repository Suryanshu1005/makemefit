import { z } from 'zod';

export const RegisterRequestSchema = z.object({
  email: z.string().email('Invalid email address').toLowerCase().trim(),
  password: z.string().min(8, 'Password must be at least 8 characters long'),
  displayName: z.string().min(2, 'Display name must be at least 2 characters long').max(100).trim(),
  timezone: z.string().default('UTC'),
});

export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;

export const LoginRequestSchema = z.object({
  email: z.string().email('Invalid email address').toLowerCase().trim(),
  password: z.string().min(1, 'Password is required'),
});

export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const TokenResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string().optional(),
  user: z.object({
    id: z.string().uuid(),
    email: z.string().email(),
    displayName: z.string(),
    timezone: z.string(),
  }),
});

export type TokenResponse = z.infer<typeof TokenResponseSchema>;

export const JwtPayloadSchema = z.object({
  userId: z.string().uuid(),
  email: z.string().email(),
  iat: z.number().optional(),
  exp: z.number().optional(),
});

export type JwtPayload = z.infer<typeof JwtPayloadSchema>;
