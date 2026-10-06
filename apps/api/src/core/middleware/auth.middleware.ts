import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { UnauthorizedError } from '../errors/app-error';

declare module 'fastify' {
  interface FastifyRequest {
    user?: {
      userId: string;
      email: string;
    };
  }
}

export async function authenticate(request: FastifyRequest, _reply: FastifyReply) {
  let token: string | undefined;

  const authHeader = request.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else if (request.cookies && (request.cookies as Record<string, string>)['access_token']) {
    token = (request.cookies as Record<string, string>)['access_token'];
  }

  if (!token) {
    throw new UnauthorizedError('Authentication token missing');
  }

  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as {
      userId: string;
      email: string;
    };
    request.user = {
      userId: payload.userId,
      email: payload.email,
    };
  } catch (err) {
    throw new UnauthorizedError('Invalid or expired authentication token');
  }
}
