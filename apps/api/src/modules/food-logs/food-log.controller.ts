import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { FoodLogService } from './food-log.service';
import { FoodAnalysisService } from '../food-analysis/food-analysis.service';
import { FoodCorrectionService } from '../food-analysis/food-correction.service';
import { ConfirmedMealService } from './confirmed-meal.service';
import { authenticate } from '../../core/middleware/auth.middleware';
import { ValidationError } from '../../core/errors/app-error';
import {
  AnalyzeFoodRequestSchema,
  SaveFoodCorrectionsRequestSchema,
  MealConfirmRequestSchema,
  DaySummaryQuerySchema,
  MealHistoryQuerySchema,
} from '@makemefit/shared';

export async function foodLogRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authenticate);

  /**
   * POST /api/v1/food-logs/upload
   * Handles multipart/form-data upload of a food image.
   */
  app.post('/upload', async (request: FastifyRequest, reply: FastifyReply) => {
    // 1. Extract multipart file stream
    const data = await request.file();
    if (!data) {
      throw new ValidationError('No image file provided in request. Please upload a file with field "file" or "image".');
    }

    // 2. Read full buffer into memory for magic byte verification and storage upload
    const buffer = await data.toBuffer();

    // 3. Process upload through service (validation, storage, database record)
    const result = await FoodLogService.processUpload({
      userId: request.user!.userId,
      buffer,
      fileName: data.filename || 'food-upload.jpg',
      mimeType: data.mimetype,
    });

    return reply.status(201).send({
      success: true,
      data: result,
      error: null,
      meta: { timestamp: new Date().toISOString() },
    });
  });

  /**
   * GET /api/v1/food-logs/uploads/:id
   * Retrieves food image upload metadata.
   */
  app.get('/uploads/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = request.params;
    const result = await FoodLogService.getUpload(request.user!.userId, id);

    return reply.status(200).send({
      success: true,
      data: result,
      error: null,
      meta: { timestamp: new Date().toISOString() },
    });
  });

  /**
   * GET /api/v1/food-logs/uploads/:id/image
   * Streams the raw uploaded image file back to authorized owner.
   */
  app.get('/uploads/:id/image', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = request.params;
    const { buffer, mimeType } = await FoodLogService.getImageBuffer(request.user!.userId, id);

    return reply
      .header('Content-Type', mimeType)
      .header('Cache-Control', 'private, max-age=3600')
      .status(200)
      .send(buffer);
  });

  /**
   * POST /api/v1/food-logs/uploads/:id/initiate-analysis
   * Transitions status to 'analyzing' and prepares pipeline for AI vision processing.
   */
  app.post(
    '/uploads/:id/initiate-analysis',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const { id } = request.params;
      const result = await FoodLogService.initiateAnalysis(request.user!.userId, id);

      return reply.status(200).send({
        success: true,
        data: result,
        error: null,
        meta: { timestamp: new Date().toISOString() },
      });
    }
  );

  /**
   * POST /api/v1/food-logs/uploads/:id/analyze
   * Executes AI vision analysis pipeline, validates output, and stores raw/normalized estimates.
   */
  app.post(
    '/uploads/:id/analyze',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { forceReanalyze?: boolean; userNotes?: string };
      }>,
      reply: FastifyReply
    ) => {
      const { id } = request.params;
      const parseResult = AnalyzeFoodRequestSchema.safeParse(request.body || {});
      if (!parseResult.success) {
        throw new ValidationError('Invalid analysis request payload', parseResult.error.format());
      }

      const result = await FoodAnalysisService.analyzeUpload(
        request.user!.userId,
        id,
        parseResult.data
      );

      return reply.status(200).send({
        success: true,
        data: result,
        error: null,
        meta: { timestamp: new Date().toISOString() },
      });
    }
  );

  /**
   * GET /api/v1/food-logs/uploads/:id/analysis
   * Retrieves existing validated AI food analysis for this upload.
   */
  app.get(
    '/uploads/:id/analysis',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const { id } = request.params;
      const result = await FoodAnalysisService.getAnalysis(request.user!.userId, id);

      return reply.status(200).send({
        success: true,
        data: result,
        error: null,
        meta: { timestamp: new Date().toISOString() },
      });
    }
  );

  /**
   * POST /api/v1/food-logs/uploads/:id/retry-analysis
   * Re-runs analysis on demand, bypassing duplicate checks.
   */
  app.post(
    '/uploads/:id/retry-analysis',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { userNotes?: string };
      }>,
      reply: FastifyReply
    ) => {
      const { id } = request.params;
      const result = await FoodAnalysisService.retryAnalysis(
        request.user!.userId,
        id,
        request.body?.userNotes
      );

      return reply.status(200).send({
        success: true,
        data: result,
        error: null,
        meta: { timestamp: new Date().toISOString() },
      });
    }
  );

  /**
   * GET /api/v1/food-logs/uploads/:id/review
   * Returns nutrition review data, presenting AI estimates alongside any saved user corrections.
   */
  app.get(
    '/uploads/:id/review',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const { id } = request.params;
      const result = await FoodCorrectionService.getReviewData(request.user!.userId, id);

      return reply.status(200).send({
        success: true,
        data: result,
        error: null,
        meta: { timestamp: new Date().toISOString() },
      });
    }
  );

  /**
   * PUT /api/v1/food-logs/uploads/:id/corrections
   * Validates and saves user manual corrections with authoritative server-recalculated totals.
   */
  app.put(
    '/uploads/:id/corrections',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: unknown;
      }>,
      reply: FastifyReply
    ) => {
      const { id } = request.params;
      const parseResult = SaveFoodCorrectionsRequestSchema.safeParse(request.body);
      if (!parseResult.success) {
        throw new ValidationError('Validation failed for food corrections payload', parseResult.error.format());
      }

      const result = await FoodCorrectionService.saveCorrections(
        request.user!.userId,
        id,
        parseResult.data
      );

      return reply.status(200).send({
        success: true,
        data: result,
        error: null,
        meta: { timestamp: new Date().toISOString() },
      });
    }
  );

  /**
   * POST /api/v1/food-logs/confirm
   * Confirms a meal from an analyzed food image, saving authoritative meal and updating today's summary.
   */
  app.post(
    '/confirm',
    async (request: FastifyRequest<{ Body: unknown }>, reply: FastifyReply) => {
      const parseResult = MealConfirmRequestSchema.safeParse(request.body);
      if (!parseResult.success) {
        throw new ValidationError('Validation failed for meal confirmation payload', parseResult.error.format());
      }

      const result = await ConfirmedMealService.confirmMeal(
        request.user!.userId,
        parseResult.data
      );

      return reply.status(201).send({
        success: true,
        data: result,
        error: null,
        meta: { timestamp: new Date().toISOString() },
      });
    }
  );

  /**
   * POST /api/v1/food-logs/uploads/:id/confirm
   * Confirms a meal directly for a specific upload ID.
   */
  app.post(
    '/uploads/:id/confirm',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: unknown;
      }>,
      reply: FastifyReply
    ) => {
      const body = (request.body && typeof request.body === 'object') ? request.body : {};
      const payload = { ...body, uploadId: request.params.id };

      const parseResult = MealConfirmRequestSchema.safeParse(payload);
      if (!parseResult.success) {
        throw new ValidationError('Validation failed for meal confirmation payload', parseResult.error.format());
      }

      const result = await ConfirmedMealService.confirmMeal(
        request.user!.userId,
        parseResult.data
      );

      return reply.status(201).send({
        success: true,
        data: result,
        error: null,
        meta: { timestamp: new Date().toISOString() },
      });
    }
  );

  /**
   * GET /api/v1/food-logs/summary
   * Retrieves daily summary for a specific date (defaults to today in user's timezone).
   */
  app.get(
    '/summary',
    async (request: FastifyRequest<{ Querystring: { date?: string } }>, reply: FastifyReply) => {
      const parseResult = DaySummaryQuerySchema.safeParse(request.query);
      if (!parseResult.success) {
        throw new ValidationError('Invalid date parameter format. Must be YYYY-MM-DD.', parseResult.error.format());
      }

      const result = await ConfirmedMealService.getDailySummary(
        request.user!.userId,
        parseResult.data.date
      );

      return reply.status(200).send({
        success: true,
        data: result,
        error: null,
        meta: { timestamp: new Date().toISOString() },
      });
    }
  );

  /**
   * GET /api/v1/food-logs/history
   * Retrieves daily summaries history up to `days` days (default 7).
   */
  app.get(
    '/history',
    async (request: FastifyRequest<{ Querystring: { days?: string } }>, reply: FastifyReply) => {
      const parseResult = MealHistoryQuerySchema.safeParse(request.query);
      if (!parseResult.success) {
        throw new ValidationError('Invalid days parameter', parseResult.error.format());
      }

      const result = await ConfirmedMealService.getHistory(
        request.user!.userId,
        parseResult.data.days
      );

      return reply.status(200).send({
        success: true,
        data: result,
        error: null,
        meta: { timestamp: new Date().toISOString() },
      });
    }
  );

  /**
   * GET /api/v1/food-logs/meals
   * Retrieves meals logged on a given date (defaults to today in user's timezone).
   */
  app.get(
    '/meals',
    async (request: FastifyRequest<{ Querystring: { date?: string } }>, reply: FastifyReply) => {
      const parseResult = DaySummaryQuerySchema.safeParse(request.query);
      if (!parseResult.success) {
        throw new ValidationError('Invalid date parameter format. Must be YYYY-MM-DD.', parseResult.error.format());
      }

      const result = await ConfirmedMealService.getDayMeals(
        request.user!.userId,
        parseResult.data.date
      );

      return reply.status(200).send({
        success: true,
        data: result,
        error: null,
        meta: { timestamp: new Date().toISOString() },
      });
    }
  );

  /**
   * GET /api/v1/food-logs/meals/:id
   * Retrieves a single meal's details and items.
   */
  app.get(
    '/meals/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const result = await ConfirmedMealService.getMeal(
        request.user!.userId,
        request.params.id
      );

      return reply.status(200).send({
        success: true,
        data: result,
        error: null,
        meta: { timestamp: new Date().toISOString() },
      });
    }
  );
}
