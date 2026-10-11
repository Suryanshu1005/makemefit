import fastify, { FastifyInstance, FastifyError, FastifyRequest, FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import { env } from './config/env';
import { logger } from './core/logger';
import { AppError } from './core/errors/app-error';
import { checkDatabaseConnection } from './database';
import { authRoutes } from './modules/auth/auth.controller';
import { userRoutes } from './modules/users/user.controller';
import { foodLogRoutes } from './modules/food-logs/food-log.controller';

export async function buildServer() {
  const app = fastify({
    logger: env.NODE_ENV === 'test' ? false : {
      level: env.NODE_ENV === 'production' ? 'info' : 'debug',
      transport: env.NODE_ENV !== 'production' ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      } : undefined,
    },
    disableRequestLogging: env.NODE_ENV === 'test',
  });

  // 1. Cross-Origin Resource Sharing
  await app.register(cors, {
    origin: (origin, cb) => {
      // Allow requests with no origin (like mobile apps, curl, Postman)
      if (!origin) return cb(null, true);
      // In development allow localhost origins
      if (env.NODE_ENV === 'development') return cb(null, true);

      const normalizedOrigin = origin.replace(/\/+$/, '');
      const allowedOrigins = env.CORS_ORIGIN.split(',').map((o) => o.trim().replace(/\/+$/, ''));

      if (
        allowedOrigins.includes('*') ||
        allowedOrigins.includes(normalizedOrigin) ||
        normalizedOrigin.endsWith('.vercel.app')
      ) {
        return cb(null, true);
      }
      cb(new Error('Not allowed by CORS'), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // 2. Cookie Support
  await app.register(cookie);

  // 3. Multipart / File Upload Support
  await app.register(multipart, {
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB limit per file
      files: 1, // Max 1 file per request
    },
  });

  // 4. Centralized Error Handler
  app.setErrorHandler((error, _request, reply) => {
    const timestamp = new Date().toISOString();

    if (error instanceof AppError) {
      return reply.status(error.statusCode).send({
        success: false,
        data: null,
        error: {
          code: error.code,
          message: error.message,
          details: error.details || null,
        },
        meta: { timestamp },
      });
    }

    // Fastify native schema validation error
    if ('validation' in error) {
      return reply.status(400).send({
        success: false,
        data: null,
        error: {
          code: 'VALIDATION_ERROR',
          message: error.message,
          details: (error as any).validation,
        },
        meta: { timestamp },
      });
    }

    // Unexpected internal server error
    logger.error({ err: error }, 'Unhandled server exception');
    return reply.status(500).send({
      success: false,
      data: null,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: env.NODE_ENV === 'production' ? 'An unexpected server error occurred' : error.message,
        details: null,
      },
      meta: { timestamp },
    });
  });

  // 4. Health Check Endpoint
  app.get('/health', async (_request, reply) => {
    const isDbConnected = await checkDatabaseConnection();
    return reply.status(200).send({
      status: isDbConnected ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      database: isDbConnected ? 'connected' : 'disconnected',
      environment: env.NODE_ENV,
    });
  });

  // 5. Register Feature Routes
  await app.register(authRoutes, { prefix: '/api/v1/auth' });
  await app.register(userRoutes, { prefix: '/api/v1/users' });
  await app.register(foodLogRoutes, { prefix: '/api/v1/food-logs' });

  return app;
}
