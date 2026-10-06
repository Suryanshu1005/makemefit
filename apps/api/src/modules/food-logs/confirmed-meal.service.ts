import { eq, and, desc, asc, isNull, inArray } from 'drizzle-orm';
import { db } from '../../database';
import { meals } from '../../database/schema/meals';
import { mealItems } from '../../database/schema/meal_items';
import { dailySummaries } from '../../database/schema/daily_summaries';
import { aiAnalyses } from '../../database/schema/ai_analyses';
import { foodLogUploads } from '../../database/schema/food_log_uploads';
import { users } from '../../database/schema/users';
import { userProfiles } from '../../database/schema/user_profiles';
import {
  NotFoundError,
  ValidationError,
  ConflictError,
  ForbiddenError,
} from '../../core/errors/app-error';
import { logger } from '../../core/logger';
import {
  MealConfirmRequest,
  MealConfirmResponse,
  MealResponse,
  DailySummary,
  MealSlot,
  FoodNutritionTotals,
  EditableFoodItem,
} from '@makemefit/shared';
import { FoodCorrectionService } from '../food-analysis/food-correction.service';

/**
 * Event payload emitted when a meal is confirmed.
 * Decouples gamification (XP, streaks, achievements) from nutrition tracking.
 */
export interface MealConfirmedEvent {
  mealId: string;
  userId: string;
  aiAnalysisId: string | null;
  dishName: string;
  mealSlot: MealSlot;
  logDate: string;
  totals: FoodNutritionTotals;
  itemCount: number;
  confirmedAt: Date;
}

export type MealConfirmedListener = (event: MealConfirmedEvent) => Promise<void> | void;

/**
 * Decoupled event bus allowing future gamification, streak, and challenge
 * listeners to react to confirmed meals without tight coupling.
 */
export class MealEventBus {
  private static listeners: MealConfirmedListener[] = [];

  public static subscribe(listener: MealConfirmedListener): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  public static async emitMealConfirmed(event: MealConfirmedEvent): Promise<void> {
    for (const listener of this.listeners) {
      try {
        await listener(event);
      } catch (err) {
        logger.error({ err, event }, 'Error in meal confirmed event listener');
      }
    }
  }

  public static clearListeners(): void {
    this.listeners = [];
  }
}

/**
 * Helper to obtain the current or target date in a specified IANA timezone.
 * Defaults to 'UTC' if invalid or missing.
 */
export function getLocalDateString(timezone?: string | null, date: Date = new Date()): string {
  try {
    if (timezone) {
      return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(date);
    }
  } catch {
    // Fallback on invalid timezone identifier
  }
  return date.toISOString().split('T')[0];
}

export class ConfirmedMealService {
  /**
   * Confirms a meal from an analyzed food image, saving authoritative meals,
   * meal items, and updating today's daily nutrition summary atomically.
   */
  public static async confirmMeal(
    userId: string,
    input: MealConfirmRequest
  ): Promise<MealConfirmResponse> {
    // 1. Look up user to get configured timezone
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!user) {
      throw new NotFoundError('User not found.');
    }

    // 2. Resolve target AI analysis record
    let analysis;
    if (input.aiAnalysisId) {
      analysis = await db.query.aiAnalyses.findFirst({
        where: eq(aiAnalyses.id, input.aiAnalysisId),
      });
    } else if (input.uploadId) {
      analysis = await db.query.aiAnalyses.findFirst({
        where: eq(aiAnalyses.uploadId, input.uploadId),
        orderBy: [desc(aiAnalyses.createdAt)],
      });
    }

    if (!analysis) {
      throw new NotFoundError('Food analysis record not found.');
    }

    // Tenant isolation: verify authenticated user owns this analysis
    if (analysis.userId !== userId) {
      throw new ForbiddenError('Access denied to this food analysis.');
    }

    // Check analysis status
    if (analysis.status === 'failed') {
      throw new ValidationError('Cannot confirm a failed food analysis.');
    }
    if (analysis.status === 'pending' || analysis.status === 'analyzing') {
      throw new ValidationError(
        `Analysis is in status "${analysis.status}" and cannot be confirmed until completed.`
      );
    }

    // 3. Duplicate confirmation check (pre-transaction check for fast-fail)
    const existingMeal = await db.query.meals.findFirst({
      where: and(eq(meals.aiAnalysisId, analysis.id), isNull(meals.deletedAt)),
    });

    if (existingMeal) {
      throw new ConflictError('This food analysis has already been confirmed and logged.');
    }

    // 4. Resolve food items: validate user input items
    const items = input.items;
    if (!items || items.length === 0) {
      throw new ValidationError('Meal must contain at least one food item.');
    }

    // Validate item values
    for (const item of items) {
      if (!item.name || !item.name.trim()) {
        throw new ValidationError('All food items must have a non-empty name.');
      }
      if (item.quantity <= 0) {
        throw new ValidationError(`Quantity for "${item.name}" must be greater than 0.`);
      }
      if (item.estimatedWeightG <= 0) {
        throw new ValidationError(`Weight for "${item.name}" must be greater than 0g.`);
      }
      if (item.calories < 0 || item.proteinG < 0 || item.carbsG < 0 || item.fatG < 0) {
        throw new ValidationError(`Nutrition values for "${item.name}" cannot be negative.`);
      }
    }

    // 5. Authoritative recalculation of final nutrition totals
    const totals = FoodCorrectionService.calculateAuthoritativeTotals(items);
    const hasUserEdits = items.some((item) => FoodCorrectionService.checkIfModified(item));

    // 6. Determine meal date using the user's configured timezone
    const userTimezone = user.timezone || 'UTC';
    const logDate = input.logDate || getLocalDateString(userTimezone, new Date());

    // 7. Atomic transaction: create meal, items, and update daily_summaries
    const { confirmedMeal, confirmedItems, updatedSummary } = await db.transaction(
      async (tx) => {
        // In-transaction duplicate check (prevents race condition concurrency)
        const txDuplicate = await tx.query.meals.findFirst({
          where: and(eq(meals.aiAnalysisId, analysis.id), isNull(meals.deletedAt)),
        });
        if (txDuplicate) {
          throw new ConflictError('This food analysis has already been confirmed and logged.');
        }

        // 7a. Insert confirmed meal record
        const [meal] = await tx
          .insert(meals)
          .values({
            userId,
            aiAnalysisId: analysis.id,
            logDate,
            mealSlot: input.mealSlot,
            dishName: input.dishName.trim(),
            totalCalories: totals.totalCalories,
            totalProteinG: totals.totalProteinG.toFixed(1),
            totalCarbsG: totals.totalCarbsG.toFixed(1),
            totalFatG: totals.totalFatG.toFixed(1),
            isAiGenerated: true,
            hasUserEdits,
            notes: input.notes?.trim() || null,
            loggedAt: new Date(),
          })
          .returning();

        // 7b. Insert meal items
        const insertedItems = [];
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          const [insertedItem] = await tx
            .insert(mealItems)
            .values({
              mealId: meal.id,
              name: item.name.trim(),
              estimatedWeightG: item.estimatedWeightG.toFixed(1),
              portionDescription: `${item.quantity} ${item.unit}`.trim(),
              calories: Math.round(item.calories),
              proteinG: item.proteinG.toFixed(1),
              carbsG: item.carbsG.toFixed(1),
              fatG: item.fatG.toFixed(1),
              confidence: item.confidence || 'medium',
              isUserModified: Boolean(item.isUserModified),
              originalAiItemData: item.originalAiItemData || null,
              sortOrder: i,
            })
            .returning();
          insertedItems.push(insertedItem);
        }

        // 7c. Query all active meals for (userId, logDate) to compute exact authoritative totals
        const allDayMeals = await tx.query.meals.findMany({
          where: and(eq(meals.userId, userId), eq(meals.logDate, logDate), isNull(meals.deletedAt)),
        });

        let consumedCalories = 0;
        let consumedProteinG = 0;
        let consumedCarbsG = 0;
        let consumedFatG = 0;

        for (const m of allDayMeals) {
          consumedCalories += m.totalCalories;
          consumedProteinG += Number(m.totalProteinG);
          consumedCarbsG += Number(m.totalCarbsG);
          consumedFatG += Number(m.totalFatG);
        }

        consumedProteinG = Math.round(consumedProteinG * 10) / 10;
        consumedCarbsG = Math.round(consumedCarbsG * 10) / 10;
        consumedFatG = Math.round(consumedFatG * 10) / 10;

        // 7d. Update or insert daily_summaries for this specific date
        let summary = await tx.query.dailySummaries.findFirst({
          where: and(
            eq(dailySummaries.userId, userId),
            eq(dailySummaries.summaryDate, logDate)
          ),
        });

        if (summary) {
          const isTargetMet = consumedCalories >= summary.targetCalories;
          const [updated] = await tx
            .update(dailySummaries)
            .set({
              consumedCalories,
              consumedProteinG: consumedProteinG.toFixed(1),
              consumedCarbsG: consumedCarbsG.toFixed(1),
              consumedFatG: consumedFatG.toFixed(1),
              mealsLoggedCount: allDayMeals.length,
              isTargetMet,
              updatedAt: new Date(),
            })
            .where(eq(dailySummaries.id, summary.id))
            .returning();
          summary = updated;
        } else {
          // Fetch user target goals from profile
          const profile = await tx.query.userProfiles.findFirst({
            where: eq(userProfiles.userId, userId),
          });

          const targetCalories = profile?.targetCalories ?? 2000;
          const targetProteinG = profile?.targetProteinG ?? '150.0';
          const targetCarbsG = profile?.targetCarbsG ?? '200.0';
          const targetFatG = profile?.targetFatG ?? '65.0';
          const isTargetMet = consumedCalories >= targetCalories;

          const [created] = await tx
            .insert(dailySummaries)
            .values({
              userId,
              summaryDate: logDate,
              targetCalories,
              targetProteinG,
              targetCarbsG,
              targetFatG,
              consumedCalories,
              consumedProteinG: consumedProteinG.toFixed(1),
              consumedCarbsG: consumedCarbsG.toFixed(1),
              consumedFatG: consumedFatG.toFixed(1),
              mealsLoggedCount: allDayMeals.length,
              isTargetMet,
            })
            .returning();
          summary = created;
        }

        // 7e. Update ai_analyses: record confirmed meal reference & final user corrected payload
        await tx
          .update(aiAnalyses)
          .set({
            userCorrectedPayload: {
              dishName: input.dishName.trim(),
              mealSlot: input.mealSlot,
              items,
              userNotes: input.notes?.trim() || undefined,
              confirmedMealId: meal.id,
            },
            hasUserCorrections: hasUserEdits,
            userCorrectedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(aiAnalyses.id, analysis.id));

        // 7f. Update food_log_uploads status to completed
        if (analysis.uploadId) {
          await tx
            .update(foodLogUploads)
            .set({
              processingStatus: 'completed',
              updatedAt: new Date(),
            })
            .where(eq(foodLogUploads.id, analysis.uploadId));
        }

        return {
          confirmedMeal: meal,
          confirmedItems: insertedItems,
          updatedSummary: summary,
        };
      }
    );

    // 8. Emit decoupled event for future XP, streak, and challenge hooks
    await MealEventBus.emitMealConfirmed({
      mealId: confirmedMeal.id,
      userId,
      aiAnalysisId: analysis.id,
      dishName: confirmedMeal.dishName,
      mealSlot: confirmedMeal.mealSlot as MealSlot,
      logDate: confirmedMeal.logDate,
      totals,
      itemCount: confirmedItems.length,
      confirmedAt: confirmedMeal.loggedAt,
    });

    // 9. Format meal and daily summary response
    const formattedMeal: MealResponse = {
      id: confirmedMeal.id,
      userId: confirmedMeal.userId,
      aiAnalysisId: confirmedMeal.aiAnalysisId,
      dishName: confirmedMeal.dishName,
      mealSlot: confirmedMeal.mealSlot as MealSlot,
      logDate: confirmedMeal.logDate,
      totalCalories: confirmedMeal.totalCalories,
      totalProteinG: Number(confirmedMeal.totalProteinG),
      totalCarbsG: Number(confirmedMeal.totalCarbsG),
      totalFatG: Number(confirmedMeal.totalFatG),
      isAiGenerated: confirmedMeal.isAiGenerated,
      hasUserEdits: confirmedMeal.hasUserEdits,
      notes: confirmedMeal.notes,
      loggedAt: confirmedMeal.loggedAt.toISOString(),
      items: confirmedItems.map((item) => ({
        id: item.id,
        name: item.name,
        estimatedWeightG: Number(item.estimatedWeightG),
        portionDescription: item.portionDescription || undefined,
        calories: item.calories,
        proteinG: Number(item.proteinG),
        carbsG: Number(item.carbsG),
        fatG: Number(item.fatG),
        confidence: (item.confidence as any) || undefined,
        isUserModified: item.isUserModified,
        originalAiItemData: (item.originalAiItemData as any) || undefined,
        sortOrder: item.sortOrder,
      })),
    };

    const remainingCalories = Math.max(
      0,
      updatedSummary.targetCalories - updatedSummary.consumedCalories
    );

    const formattedSummary: DailySummary = {
      id: updatedSummary.id,
      userId: updatedSummary.userId,
      summaryDate: updatedSummary.summaryDate,
      targetCalories: updatedSummary.targetCalories,
      targetProteinG: Number(updatedSummary.targetProteinG),
      targetCarbsG: Number(updatedSummary.targetCarbsG),
      targetFatG: Number(updatedSummary.targetFatG),
      consumedCalories: updatedSummary.consumedCalories,
      consumedProteinG: Number(updatedSummary.consumedProteinG),
      consumedCarbsG: Number(updatedSummary.consumedCarbsG),
      consumedFatG: Number(updatedSummary.consumedFatG),
      mealsLoggedCount: updatedSummary.mealsLoggedCount,
      isTargetMet: updatedSummary.isTargetMet,
      remainingCalories,
    };

    return {
      success: true,
      meal: formattedMeal,
      todaySummary: formattedSummary,
      message: 'Meal confirmed and logged successfully.',
    };
  }

  /**
   * Retrieves daily summary for a given date in the user's timezone (or today if omitted).
   */
  public static async getDailySummary(
    userId: string,
    targetDate?: string
  ): Promise<DailySummary> {
    const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
    if (!user) throw new NotFoundError('User not found.');

    const summaryDate = targetDate || getLocalDateString(user.timezone, new Date());

    const summary = await db.query.dailySummaries.findFirst({
      where: and(
        eq(dailySummaries.userId, userId),
        eq(dailySummaries.summaryDate, summaryDate)
      ),
    });

    if (summary) {
      return {
        id: summary.id,
        userId: summary.userId,
        summaryDate: summary.summaryDate,
        targetCalories: summary.targetCalories,
        targetProteinG: Number(summary.targetProteinG),
        targetCarbsG: Number(summary.targetCarbsG),
        targetFatG: Number(summary.targetFatG),
        consumedCalories: summary.consumedCalories,
        consumedProteinG: Number(summary.consumedProteinG),
        consumedCarbsG: Number(summary.consumedCarbsG),
        consumedFatG: Number(summary.consumedFatG),
        mealsLoggedCount: summary.mealsLoggedCount,
        isTargetMet: summary.isTargetMet,
        remainingCalories: Math.max(0, summary.targetCalories - summary.consumedCalories),
      };
    }

    // Default zero-summary if no meals logged on that date
    const profile = await db.query.userProfiles.findFirst({
      where: eq(userProfiles.userId, userId),
    });

    const targetCalories = profile?.targetCalories ?? 2000;
    const targetProteinG = Number(profile?.targetProteinG ?? 150);
    const targetCarbsG = Number(profile?.targetCarbsG ?? 200);
    const targetFatG = Number(profile?.targetFatG ?? 65);

    return {
      id: 'unrecorded',
      userId,
      summaryDate,
      targetCalories,
      targetProteinG,
      targetCarbsG,
      targetFatG,
      consumedCalories: 0,
      consumedProteinG: 0,
      consumedCarbsG: 0,
      consumedFatG: 0,
      mealsLoggedCount: 0,
      isTargetMet: false,
      remainingCalories: targetCalories,
    };
  }

  /**
   * Retrieves recent daily summaries history up to `days` days.
   */
  public static async getHistory(
    userId: string,
    days: number = 7
  ): Promise<DailySummary[]> {
    const clampedDays = Math.max(1, Math.min(30, days));

    const records = await db.query.dailySummaries.findMany({
      where: eq(dailySummaries.userId, userId),
      orderBy: [desc(dailySummaries.summaryDate)],
      limit: clampedDays,
    });

    return records.map((summary) => ({
      id: summary.id,
      userId: summary.userId,
      summaryDate: summary.summaryDate,
      targetCalories: summary.targetCalories,
      targetProteinG: Number(summary.targetProteinG),
      targetCarbsG: Number(summary.targetCarbsG),
      targetFatG: Number(summary.targetFatG),
      consumedCalories: summary.consumedCalories,
      consumedProteinG: Number(summary.consumedProteinG),
      consumedCarbsG: Number(summary.consumedCarbsG),
      consumedFatG: Number(summary.consumedFatG),
      mealsLoggedCount: summary.mealsLoggedCount,
      isTargetMet: summary.isTargetMet,
      remainingCalories: Math.max(0, summary.targetCalories - summary.consumedCalories),
    }));
  }

  /**
   * Retrieves the list of confirmed meals for a given date.
   */
  public static async getDayMeals(
    userId: string,
    targetDate?: string
  ): Promise<MealResponse[]> {
    const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
    if (!user) throw new NotFoundError('User not found.');

    const logDate = targetDate || getLocalDateString(user.timezone, new Date());

    const activeMeals = await db.query.meals.findMany({
      where: and(eq(meals.userId, userId), eq(meals.logDate, logDate), isNull(meals.deletedAt)),
      orderBy: [desc(meals.loggedAt)],
    });

    const mealIds = activeMeals.map((m) => m.id);
    const allItems =
      mealIds.length > 0
        ? await db.query.mealItems.findMany({
            where: and(inArray(mealItems.mealId, mealIds), isNull(mealItems.deletedAt)),
            orderBy: [asc(mealItems.sortOrder)],
          })
        : [];

    const itemsByMealId = new Map<string, typeof allItems>();
    for (const item of allItems) {
      const list = itemsByMealId.get(item.mealId) ?? [];
      list.push(item);
      itemsByMealId.set(item.mealId, list);
    }

    return activeMeals.map((m) => ({
      id: m.id,
      userId: m.userId,
      aiAnalysisId: m.aiAnalysisId,
      dishName: m.dishName,
      mealSlot: m.mealSlot as MealSlot,
      logDate: m.logDate,
      totalCalories: m.totalCalories,
      totalProteinG: Number(m.totalProteinG),
      totalCarbsG: Number(m.totalCarbsG),
      totalFatG: Number(m.totalFatG),
      isAiGenerated: m.isAiGenerated,
      hasUserEdits: m.hasUserEdits,
      notes: m.notes,
      loggedAt: m.loggedAt.toISOString(),
      items: (itemsByMealId.get(m.id) ?? []).map((i) => ({
        id: i.id,
        name: i.name,
        estimatedWeightG: Number(i.estimatedWeightG),
        portionDescription: i.portionDescription || undefined,
        calories: i.calories,
        proteinG: Number(i.proteinG),
        carbsG: Number(i.carbsG),
        fatG: Number(i.fatG),
        confidence: (i.confidence as any) || undefined,
        isUserModified: i.isUserModified,
        originalAiItemData: (i.originalAiItemData as any) || undefined,
        sortOrder: i.sortOrder,
      })),
    }));
  }

  /**
   * Retrieves single meal details by ID.
   */
  public static async getMeal(userId: string, mealId: string): Promise<MealResponse> {
    const meal = await db.query.meals.findFirst({
      where: and(eq(meals.id, mealId), eq(meals.userId, userId), isNull(meals.deletedAt)),
    });

    if (!meal) {
      throw new NotFoundError('Meal record not found.');
    }

    const items = await db.query.mealItems.findMany({
      where: and(eq(mealItems.mealId, meal.id), isNull(mealItems.deletedAt)),
      orderBy: [asc(mealItems.sortOrder)],
    });

    return {
      id: meal.id,
      userId: meal.userId,
      aiAnalysisId: meal.aiAnalysisId,
      dishName: meal.dishName,
      mealSlot: meal.mealSlot as MealSlot,
      logDate: meal.logDate,
      totalCalories: meal.totalCalories,
      totalProteinG: Number(meal.totalProteinG),
      totalCarbsG: Number(meal.totalCarbsG),
      totalFatG: Number(meal.totalFatG),
      isAiGenerated: meal.isAiGenerated,
      hasUserEdits: meal.hasUserEdits,
      notes: meal.notes,
      loggedAt: meal.loggedAt.toISOString(),
      items: items.map((i) => ({
        id: i.id,
        name: i.name,
        estimatedWeightG: Number(i.estimatedWeightG),
        portionDescription: i.portionDescription || undefined,
        calories: i.calories,
        proteinG: Number(i.proteinG),
        carbsG: Number(i.carbsG),
        fatG: Number(i.fatG),
        confidence: (i.confidence as any) || undefined,
        isUserModified: i.isUserModified,
        originalAiItemData: (i.originalAiItemData as any) || undefined,
        sortOrder: i.sortOrder,
      })),
    };
  }
}
