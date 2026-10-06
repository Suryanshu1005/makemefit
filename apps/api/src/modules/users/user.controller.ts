import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  OnboardingRequestSchema,
  UpdateProfileRequestSchema,
  CalculateTargetsRequestSchema,
} from '@makemefit/shared';
import { UserService } from './user.service';
import { authenticate } from '../../core/middleware/auth.middleware';
import { ValidationError } from '../../core/errors/app-error';

export async function userRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  // Complete initial onboarding
  app.post('/onboarding', async (request: FastifyRequest, reply: FastifyReply) => {
    const parseResult = OnboardingRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw new ValidationError('Validation failed for onboarding input', parseResult.error.format());
    }

    const result = await UserService.completeOnboarding(request.user!.userId, parseResult.data);

    return reply.status(200).send({
      success: true,
      data: result,
      error: null,
      meta: { timestamp: new Date().toISOString() },
    });
  });

  // Get current user profile and target breakdown
  app.get('/profile', async (request: FastifyRequest, reply: FastifyReply) => {
    const profile = await UserService.getProfile(request.user!.userId);

    return reply.status(200).send({
      success: true,
      data: profile,
      error: null,
      meta: { timestamp: new Date().toISOString() },
    });
  });

  // Edit user profile and fitness targets
  app.put('/profile', async (request: FastifyRequest, reply: FastifyReply) => {
    const parseResult = UpdateProfileRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw new ValidationError('Validation failed for profile update', parseResult.error.format());
    }

    const result = await UserService.updateProfile(request.user!.userId, parseResult.data);

    return reply.status(200).send({
      success: true,
      data: result,
      error: null,
      meta: { timestamp: new Date().toISOString() },
    });
  });

  // Dynamic preview calculation endpoint (no persistence)
  app.post('/calculate-targets', async (request: FastifyRequest, reply: FastifyReply) => {
    const parseResult = CalculateTargetsRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      throw new ValidationError('Validation failed for target calculation', parseResult.error.format());
    }

    const result = UserService.calculateTargets(parseResult.data);

    return reply.status(200).send({
      success: true,
      data: result,
      error: null,
      meta: { timestamp: new Date().toISOString() },
    });
  });

  // Dashboard endpoint consuming current daily target and today's summary
  app.get('/dashboard', async (request: FastifyRequest, reply: FastifyReply) => {
    const dashboardData = await UserService.getDashboardData(request.user!.userId);

    return reply.status(200).send({
      success: true,
      data: dashboardData,
      error: null,
      meta: { timestamp: new Date().toISOString() },
    });
  });

  // DEV/TEST ONLY: Seed realistic demo meals for today
  app.post('/demo/seed-meals', async (request: FastifyRequest, reply: FastifyReply) => {
    const data = await UserService.seedDemoMeals(request.user!.userId);
    return reply.status(200).send({
      success: true,
      data,
      error: null,
      meta: { timestamp: new Date().toISOString() },
    });
  });

  // DEV/TEST ONLY: Seed meals that intentionally exceed today's target
  app.post('/demo/exceed-target', async (request: FastifyRequest, reply: FastifyReply) => {
    const data = await UserService.seedExceededMeals(request.user!.userId);
    return reply.status(200).send({
      success: true,
      data,
      error: null,
      meta: { timestamp: new Date().toISOString() },
    });
  });

  // DEV/TEST ONLY: Clear today's meals to test zero state
  app.delete('/demo/meals', async (request: FastifyRequest, reply: FastifyReply) => {
    const data = await UserService.clearTodayMeals(request.user!.userId);
    return reply.status(200).send({
      success: true,
      data,
      error: null,
      meta: { timestamp: new Date().toISOString() },
    });
  });
}
