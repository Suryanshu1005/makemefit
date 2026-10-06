import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { RegisterRequestSchema, LoginRequestSchema } from '@makemefit/shared';
import { AuthService } from './auth.service';
import { authenticate } from '../../core/middleware/auth.middleware';
import { ValidationError } from '../../core/errors/app-error';

export async function authRoutes(app: FastifyInstance) {
  app.post('/register', async (request: FastifyRequest, reply: FastifyReply) => {
    const parseResult = RegisterRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw new ValidationError('Validation failed for registration input', parseResult.error.format());
    }

    const result = await AuthService.register(parseResult.data);

    reply.setCookie('access_token', result.accessToken, {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 15 * 60, // 15 mins
    });

    if (result.refreshToken) {
      reply.setCookie('refresh_token', result.refreshToken, {
        path: '/',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60, // 30 days
      });
    }

    return reply.status(201).send({
      success: true,
      data: result,
      error: null,
      meta: { timestamp: new Date().toISOString() },
    });
  });

  app.post('/login', async (request: FastifyRequest, reply: FastifyReply) => {
    const parseResult = LoginRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw new ValidationError('Validation failed for login input', parseResult.error.format());
    }

    const result = await AuthService.login(parseResult.data);

    reply.setCookie('access_token', result.accessToken, {
      path: '/',
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 15 * 60,
    });

    if (result.refreshToken) {
      reply.setCookie('refresh_token', result.refreshToken, {
        path: '/',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 30 * 24 * 60 * 60,
      });
    }

    return reply.status(200).send({
      success: true,
      data: result,
      error: null,
      meta: { timestamp: new Date().toISOString() },
    });
  });

  app.post('/logout', async (_request: FastifyRequest, reply: FastifyReply) => {
    reply.clearCookie('access_token', { path: '/' });
    reply.clearCookie('refresh_token', { path: '/' });

    return reply.status(200).send({
      success: true,
      data: { message: 'Logged out successfully' },
      error: null,
      meta: { timestamp: new Date().toISOString() },
    });
  });

  app.get('/me', { preHandler: [authenticate] }, async (request: FastifyRequest, reply: FastifyReply) => {
    const data = await AuthService.getMe(request.user!.userId);

    return reply.status(200).send({
      success: true,
      data,
      error: null,
      meta: { timestamp: new Date().toISOString() },
    });
  });
}
