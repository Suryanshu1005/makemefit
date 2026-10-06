import { eq, and, desc, asc, isNull, inArray } from 'drizzle-orm';
import { db } from '../../database';
import { users, userProfiles, dailySummaries, userGamification, meals, mealItems } from '../../database/schema';
import { NotFoundError } from '../../core/errors/app-error';
import {
  OnboardingRequest,
  UpdateProfileRequest,
  CalculateTargetsRequest,
  NutritionCalculator,
  FitnessGoal,
  ActivityLevel,
  Gender,
  MealSlot,
  GamificationEngine,
} from '@makemefit/shared';

function getLocalDateString(timezone?: string | null): string {
  try {
    if (timezone) {
      return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date());
    }
  } catch {
    // fallback if timezone string is invalid
  }
  return new Date().toISOString().split('T')[0];
}

export class UserService {
  /**
   * Completes onboarding flow and initializes active daily targets and gamification.
   */
  static async completeOnboarding(userId: string, input: OnboardingRequest) {
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    const age = NutritionCalculator.calculateAge(input.birthDate);

    // Resolve system vs user vs active target
    const resolved = NutritionCalculator.resolveTargets({
      gender: input.gender,
      weightKg: input.weightKg,
      heightCm: input.heightCm,
      ageYears: age,
      activityLevel: input.activityLevel,
      goal: input.goal,
      isTargetOverridden: input.isTargetOverridden,
      customCalories: input.customCalories,
      customProteinG: input.customProteinG,
      customCarbsG: input.customCarbsG,
      customFatG: input.customFatG,
    });

    const targetCalories = resolved.activeTarget.calories;
    const targetProteinG = resolved.activeTarget.proteinG;
    const targetCarbsG = resolved.activeTarget.carbsG;
    const targetFatG = resolved.activeTarget.fatG;

    const userTimezone = input.timezone || user.timezone || 'UTC';
    const todayDate = getLocalDateString(userTimezone);

    // Atomically persist profile, user timezone, and today's summary
    const updatedProfile = await db.transaction(async (tx) => {
      if (input.timezone) {
        await tx
          .update(users)
          .set({ timezone: input.timezone, updatedAt: new Date() })
          .where(eq(users.id, userId));
      }

      const [profile] = await tx
        .update(userProfiles)
        .set({
          gender: input.gender,
          birthDate: input.birthDate,
          heightCm: input.heightCm.toFixed(2),
          weightKg: input.weightKg.toFixed(2),
          activityLevel: input.activityLevel,
          goal: input.goal,
          recommendedCalories: resolved.systemRecommended.calories,
          customCalories: resolved.userSelected?.calories ?? null,
          targetCalories,
          targetProteinG: targetProteinG.toFixed(1),
          targetCarbsG: targetCarbsG.toFixed(1),
          targetFatG: targetFatG.toFixed(1),
          isTargetOverridden: resolved.activeTarget.isOverridden,
          isOnboarded: true,
          updatedAt: new Date(),
        })
        .where(eq(userProfiles.userId, userId))
        .returning();

      // Upsert today's summary record with the active daily target
      const existingSummary = await tx.query.dailySummaries.findFirst({
        where: and(eq(dailySummaries.userId, userId), eq(dailySummaries.summaryDate, todayDate)),
      });

      if (existingSummary) {
        await tx
          .update(dailySummaries)
          .set({
            targetCalories,
            targetProteinG: targetProteinG.toFixed(1),
            targetCarbsG: targetCarbsG.toFixed(1),
            targetFatG: targetFatG.toFixed(1),
            updatedAt: new Date(),
          })
          .where(eq(dailySummaries.id, existingSummary.id));
      } else {
        await tx.insert(dailySummaries).values({
          userId,
          summaryDate: todayDate,
          targetCalories,
          targetProteinG: targetProteinG.toFixed(1),
          targetCarbsG: targetCarbsG.toFixed(1),
          targetFatG: targetFatG.toFixed(1),
          consumedCalories: 0,
          consumedProteinG: '0',
          consumedCarbsG: '0',
          consumedFatG: '0',
          mealsLoggedCount: 0,
          isTargetMet: false,
        });
      }

      return profile;
    });

    return {
      profile: {
        gender: updatedProfile.gender as Gender,
        birthDate: updatedProfile.birthDate,
        heightCm: Number(updatedProfile.heightCm),
        weightKg: Number(updatedProfile.weightKg),
        activityLevel: updatedProfile.activityLevel as ActivityLevel,
        goal: updatedProfile.goal as FitnessGoal,
        recommendedCalories: updatedProfile.recommendedCalories ?? resolved.systemRecommended.calories,
        customCalories: updatedProfile.customCalories,
        targetCalories: updatedProfile.targetCalories,
        targetProteinG: Number(updatedProfile.targetProteinG),
        targetCarbsG: Number(updatedProfile.targetCarbsG),
        targetFatG: Number(updatedProfile.targetFatG),
        isTargetOverridden: updatedProfile.isTargetOverridden,
        isOnboarded: updatedProfile.isOnboarded,
      },
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        timezone: userTimezone,
      },
      targets: resolved,
    };
  }

  /**
   * Updates user profile, calculates new targets, and updates ONLY today's summary,
   * strictly safeguarding historical daily records from being overwritten.
   */
  static async updateProfile(userId: string, input: UpdateProfileRequest) {
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    const currentProfile = await db.query.userProfiles.findFirst({
      where: eq(userProfiles.userId, userId),
    });

    if (!currentProfile) {
      throw new NotFoundError('Profile not found');
    }

    const age = NutritionCalculator.calculateAge(input.birthDate);

    // Resolve system vs user vs active target
    const resolved = NutritionCalculator.resolveTargets({
      gender: input.gender,
      weightKg: input.weightKg,
      heightCm: input.heightCm,
      ageYears: age,
      activityLevel: input.activityLevel,
      goal: input.goal,
      isTargetOverridden: input.isTargetOverridden,
      customCalories: input.customCalories,
      customProteinG: input.customProteinG,
      customCarbsG: input.customCarbsG,
      customFatG: input.customFatG,
    });

    const targetCalories = resolved.activeTarget.calories;
    const targetProteinG = resolved.activeTarget.proteinG;
    const targetCarbsG = resolved.activeTarget.carbsG;
    const targetFatG = resolved.activeTarget.fatG;

    const userTimezone = input.timezone || user.timezone || 'UTC';
    const todayDate = getLocalDateString(userTimezone);

    const updatedProfile = await db.transaction(async (tx) => {
      // 1. Update user info if provided
      const userUpdates: Partial<typeof users.$inferInsert> = { updatedAt: new Date() };
      if (input.displayName) userUpdates.displayName = input.displayName;
      if (input.timezone) userUpdates.timezone = input.timezone;

      if (input.displayName || input.timezone) {
        await tx.update(users).set(userUpdates).where(eq(users.id, userId));
      }

      // 2. Update user profile
      const [profile] = await tx
        .update(userProfiles)
        .set({
          gender: input.gender,
          birthDate: input.birthDate,
          heightCm: input.heightCm.toFixed(2),
          weightKg: input.weightKg.toFixed(2),
          activityLevel: input.activityLevel,
          goal: input.goal,
          recommendedCalories: resolved.systemRecommended.calories,
          customCalories: resolved.userSelected?.calories ?? null,
          targetCalories,
          targetProteinG: targetProteinG.toFixed(1),
          targetCarbsG: targetCarbsG.toFixed(1),
          targetFatG: targetFatG.toFixed(1),
          isTargetOverridden: resolved.activeTarget.isOverridden,
          updatedAt: new Date(),
        })
        .where(eq(userProfiles.userId, userId))
        .returning();

      // 3. Update or create record ONLY for TODAY (summaryDate = todayDate)
      // HISTORICAL INTEGRITY: We DO NOT update past records (summaryDate < todayDate)
      const existingSummary = await tx.query.dailySummaries.findFirst({
        where: and(eq(dailySummaries.userId, userId), eq(dailySummaries.summaryDate, todayDate)),
      });

      if (existingSummary) {
        await tx
          .update(dailySummaries)
          .set({
            targetCalories,
            targetProteinG: targetProteinG.toFixed(1),
            targetCarbsG: targetCarbsG.toFixed(1),
            targetFatG: targetFatG.toFixed(1),
            updatedAt: new Date(),
          })
          .where(eq(dailySummaries.id, existingSummary.id));
      } else {
        await tx.insert(dailySummaries).values({
          userId,
          summaryDate: todayDate,
          targetCalories,
          targetProteinG: targetProteinG.toFixed(1),
          targetCarbsG: targetCarbsG.toFixed(1),
          targetFatG: targetFatG.toFixed(1),
          consumedCalories: 0,
          consumedProteinG: '0',
          consumedCarbsG: '0',
          consumedFatG: '0',
          mealsLoggedCount: 0,
          isTargetMet: false,
        });
      }

      return profile;
    });

    return {
      profile: {
        id: updatedProfile.id,
        gender: updatedProfile.gender as Gender,
        birthDate: updatedProfile.birthDate,
        age,
        heightCm: Number(updatedProfile.heightCm),
        weightKg: Number(updatedProfile.weightKg),
        activityLevel: updatedProfile.activityLevel as ActivityLevel,
        goal: updatedProfile.goal as FitnessGoal,
        recommendedCalories: updatedProfile.recommendedCalories ?? resolved.systemRecommended.calories,
        customCalories: updatedProfile.customCalories,
        targetCalories: updatedProfile.targetCalories,
        targetProteinG: Number(updatedProfile.targetProteinG),
        targetCarbsG: Number(updatedProfile.targetCarbsG),
        targetFatG: Number(updatedProfile.targetFatG),
        isTargetOverridden: updatedProfile.isTargetOverridden,
        isOnboarded: updatedProfile.isOnboarded,
      },
      user: {
        id: user.id,
        email: user.email,
        displayName: input.displayName || user.displayName,
        timezone: userTimezone,
      },
      targets: resolved,
    };
  }

  /**
   * Calculates energy expenditure and macro targets dynamically without saving to DB.
   */
  static calculateTargets(input: CalculateTargetsRequest) {
    const age = NutritionCalculator.calculateAge(input.birthDate);
    return NutritionCalculator.calculatePlan({
      gender: input.gender,
      weightKg: input.weightKg,
      heightCm: input.heightCm,
      ageYears: age,
      activityLevel: input.activityLevel,
      goal: input.goal,
    });
  }

  /**
   * Retrieves user profile, live targets, and structured calculation breakdown.
   */
  static async getProfile(userId: string) {
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    const profile = await db.query.userProfiles.findFirst({
      where: eq(userProfiles.userId, userId),
    });

    if (!profile) {
      throw new NotFoundError('Profile not found');
    }

    const age = NutritionCalculator.calculateAge(profile.birthDate);

    const resolved = NutritionCalculator.resolveTargets({
      gender: profile.gender as Gender,
      weightKg: Number(profile.weightKg),
      heightCm: Number(profile.heightCm),
      ageYears: age,
      activityLevel: profile.activityLevel as ActivityLevel,
      goal: profile.goal as FitnessGoal,
      isTargetOverridden: profile.isTargetOverridden,
      customCalories: profile.customCalories,
      customProteinG: profile.isTargetOverridden ? Number(profile.targetProteinG) : null,
      customCarbsG: profile.isTargetOverridden ? Number(profile.targetCarbsG) : null,
      customFatG: profile.isTargetOverridden ? Number(profile.targetFatG) : null,
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        timezone: user.timezone,
        createdAt: user.createdAt.toISOString(),
      },
      profile: {
        gender: profile.gender as Gender,
        birthDate: profile.birthDate,
        age,
        heightCm: Number(profile.heightCm),
        weightKg: Number(profile.weightKg),
        activityLevel: profile.activityLevel as ActivityLevel,
        goal: profile.goal as FitnessGoal,
        recommendedCalories: profile.recommendedCalories ?? resolved.systemRecommended.calories,
        customCalories: profile.customCalories,
        targetCalories: profile.targetCalories,
        targetProteinG: Number(profile.targetProteinG),
        targetCarbsG: Number(profile.targetCarbsG),
        targetFatG: Number(profile.targetFatG),
        isTargetOverridden: profile.isTargetOverridden,
        isOnboarded: profile.isOnboarded,
      },
      targets: resolved,
    };
  }

  /**
   * Retrieves complete dashboard data consuming today's active target,
   * today's consumed macros, gamification state, and meals.
   */
  static async getDashboardData(userId: string) {
    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!user) {
      throw new NotFoundError('User not found');
    }

    const profile = await db.query.userProfiles.findFirst({
      where: eq(userProfiles.userId, userId),
    });

    if (!profile) {
      throw new NotFoundError('Profile not found');
    }

    const todayDate = getLocalDateString(user.timezone);

    // Ensure today's daily_summary exists
    let summary = await db.query.dailySummaries.findFirst({
      where: and(eq(dailySummaries.userId, userId), eq(dailySummaries.summaryDate, todayDate)),
    });

    if (!summary) {
      const [newSummary] = await db
        .insert(dailySummaries)
        .values({
          userId,
          summaryDate: todayDate,
          targetCalories: profile.targetCalories,
          targetProteinG: profile.targetProteinG,
          targetCarbsG: profile.targetCarbsG,
          targetFatG: profile.targetFatG,
          consumedCalories: 0,
          consumedProteinG: '0',
          consumedCarbsG: '0',
          consumedFatG: '0',
          mealsLoggedCount: 0,
          isTargetMet: false,
        })
        .returning();
      summary = newSummary;
    }

    // Gamification state
    let gamification = await db.query.userGamification.findFirst({
      where: eq(userGamification.userId, userId),
    });

    if (!gamification) {
      const [newGamification] = await db
        .insert(userGamification)
        .values({
          userId,
          currentStreak: 0,
          longestStreak: 0,
          totalXp: 0,
          currentLevel: 1,
        })
        .returning();
      gamification = newGamification;
    }

    // Today's meals (empty array until Phase 2 food logging)
    const activeMeals = await db.query.meals.findMany({
      where: and(eq(meals.userId, userId), eq(meals.logDate, todayDate), isNull(meals.deletedAt)),
      orderBy: [desc(meals.loggedAt)],
    });

    const mealIds = activeMeals.map((m) => m.id);
    const allItems = mealIds.length > 0
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

    const consumedCalories = summary.consumedCalories;
    const remainingCalories = Math.max(0, summary.targetCalories - consumedCalories);

    return {
      user: {
        id: user.id,
        displayName: user.displayName,
        email: user.email,
        timezone: user.timezone,
      },
      todaySummary: {
        date: summary.summaryDate,
        targetCalories: summary.targetCalories,
        targetProteinG: Number(summary.targetProteinG),
        targetCarbsG: Number(summary.targetCarbsG),
        targetFatG: Number(summary.targetFatG),
        consumedCalories: summary.consumedCalories,
        consumedProteinG: Number(summary.consumedProteinG),
        consumedCarbsG: Number(summary.consumedCarbsG),
        consumedFatG: Number(summary.consumedFatG),
        remainingCalories,
        mealsLoggedCount: summary.mealsLoggedCount,
        isTargetMet: summary.isTargetMet,
      },
      targetContext: {
        recommendedCalories: profile.recommendedCalories ?? profile.targetCalories,
        customCalories: profile.customCalories,
        activeTargetCalories: profile.targetCalories,
        isTargetOverridden: profile.isTargetOverridden,
        goal: profile.goal as FitnessGoal,
      },
      gamification: {
        currentStreak: gamification.currentStreak,
        currentLevel: gamification.currentLevel,
        totalXp: gamification.totalXp,
        xpInCurrentLevel: GamificationEngine.calculateLevelProgress(gamification.totalXp).xpInCurrentLevel,
        xpSpanForLevel: GamificationEngine.calculateLevelProgress(gamification.totalXp).xpSpanForLevel,
        progressPercent: GamificationEngine.calculateLevelProgress(gamification.totalXp).progressPercent,
        nextLevelCeiling: GamificationEngine.calculateLevelProgress(gamification.totalXp).nextLevelCeiling,
      },
      meals: activeMeals.map((m) => {
        const items = itemsByMealId.get(m.id) ?? [];
        return {
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
          items: items.map((i) => ({
            id: i.id,
            name: i.name,
            estimatedWeightG: Number(i.estimatedWeightG),
            portionDescription: i.portionDescription ?? undefined,
            calories: i.calories,
            proteinG: Number(i.proteinG),
            carbsG: Number(i.carbsG),
            fatG: Number(i.fatG),
            confidence: i.confidence as any,
            isUserModified: i.isUserModified,
            sortOrder: i.sortOrder,
          })),
        };
      }),
    };
  }

  /**
   * DEV/TEST ONLY: Seeds realistic sample meals for today directly into PostgreSQL,
   * updating today's daily_summary and gamification state.
   */
  static async seedDemoMeals(userId: string) {
    const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
    if (!user) throw new NotFoundError('User not found');
    const profile = await db.query.userProfiles.findFirst({ where: eq(userProfiles.userId, userId) });
    if (!profile) throw new NotFoundError('Profile not found');

    const todayDate = getLocalDateString(user.timezone);

    // Clean any existing meals for today first to avoid runaway duplicates
    await db.delete(meals).where(and(eq(meals.userId, userId), eq(meals.logDate, todayDate)));

    const demoMealsData = [
      {
        mealSlot: 'breakfast' as MealSlot,
        dishName: 'Avocado Toast & Poached Eggs',
        totalCalories: 450,
        totalProteinG: 22.0,
        totalCarbsG: 38.0,
        totalFatG: 24.0,
        items: [
          { name: 'Sourdough Bread', estimatedWeightG: 70, portionDescription: '2 slices toasted', calories: 180, proteinG: 6.0, carbsG: 34.0, fatG: 2.0, sortOrder: 1 },
          { name: 'Poached Eggs', estimatedWeightG: 100, portionDescription: '2 large eggs', calories: 140, proteinG: 12.0, carbsG: 0.8, fatG: 10.0, sortOrder: 2 },
          { name: 'Hass Avocado', estimatedWeightG: 75, portionDescription: 'Half avocado sliced', calories: 130, proteinG: 4.0, carbsG: 3.2, fatG: 12.0, sortOrder: 3 },
        ],
      },
      {
        mealSlot: 'lunch' as MealSlot,
        dishName: 'Grilled Chicken Quinoa Power Bowl',
        totalCalories: 620,
        totalProteinG: 52.0,
        totalCarbsG: 64.0,
        totalFatG: 16.0,
        items: [
          { name: 'Grilled Chicken Breast', estimatedWeightG: 200, portionDescription: 'Marinated skinless breast', calories: 280, proteinG: 44.0, carbsG: 0.0, fatG: 6.0, sortOrder: 1 },
          { name: 'Cooked Quinoa', estimatedWeightG: 180, portionDescription: '1 cup steamed quinoa', calories: 220, proteinG: 8.0, carbsG: 39.0, fatG: 4.0, sortOrder: 2 },
          { name: 'Steamed Broccoli & Dressing', estimatedWeightG: 120, portionDescription: 'Florets with olive dressing', calories: 120, proteinG: 0.0, carbsG: 25.0, fatG: 6.0, sortOrder: 3 },
        ],
      },
      {
        mealSlot: 'snack' as MealSlot,
        dishName: 'Vanilla Whey Shake & Almonds',
        totalCalories: 310,
        totalProteinG: 32.0,
        totalCarbsG: 12.0,
        totalFatG: 14.0,
        items: [
          { name: 'Vanilla Whey Isolate', estimatedWeightG: 35, portionDescription: '1 rounded scoop', calories: 140, proteinG: 28.0, carbsG: 2.0, fatG: 1.5, sortOrder: 1 },
          { name: 'Roasted Almonds', estimatedWeightG: 25, portionDescription: 'Handful', calories: 145, proteinG: 3.0, carbsG: 9.0, fatG: 11.5, sortOrder: 2 },
          { name: 'Unsweetened Almond Milk', estimatedWeightG: 240, portionDescription: '1 glass', calories: 25, proteinG: 1.0, carbsG: 1.0, fatG: 1.0, sortOrder: 3 },
        ],
      },
    ];

    let totalCalories = 0;
    let totalProteinG = 0;
    let totalCarbsG = 0;
    let totalFatG = 0;

    for (const m of demoMealsData) {
      totalCalories += m.totalCalories;
      totalProteinG += m.totalProteinG;
      totalCarbsG += m.totalCarbsG;
      totalFatG += m.totalFatG;

      const [insertedMeal] = await db
        .insert(meals)
        .values({
          userId,
          logDate: todayDate,
          mealSlot: m.mealSlot,
          dishName: m.dishName,
          totalCalories: m.totalCalories,
          totalProteinG: m.totalProteinG.toFixed(1),
          totalCarbsG: m.totalCarbsG.toFixed(1),
          totalFatG: m.totalFatG.toFixed(1),
          isAiGenerated: false,
          hasUserEdits: false,
        })
        .returning();

      for (const item of m.items) {
        await db.insert(mealItems).values({
          mealId: insertedMeal.id,
          name: item.name,
          estimatedWeightG: item.estimatedWeightG.toFixed(1),
          portionDescription: item.portionDescription,
          calories: item.calories,
          proteinG: item.proteinG.toFixed(1),
          carbsG: item.carbsG.toFixed(1),
          fatG: item.fatG.toFixed(1),
          confidence: 'high',
          sortOrder: item.sortOrder,
        });
      }
    }

    // Update today's summary
    const isTargetMet = totalCalories >= profile.targetCalories * 0.95 && totalCalories <= profile.targetCalories * 1.10;
    const existingSummary = await db.query.dailySummaries.findFirst({
      where: and(eq(dailySummaries.userId, userId), eq(dailySummaries.summaryDate, todayDate)),
    });

    if (existingSummary) {
      await db
        .update(dailySummaries)
        .set({
          consumedCalories: totalCalories,
          consumedProteinG: totalProteinG.toFixed(1),
          consumedCarbsG: totalCarbsG.toFixed(1),
          consumedFatG: totalFatG.toFixed(1),
          mealsLoggedCount: demoMealsData.length,
          isTargetMet,
          updatedAt: new Date(),
        })
        .where(eq(dailySummaries.id, existingSummary.id));
    }

    // Update user gamification streak & XP (+150 XP)
    const gamification = await db.query.userGamification.findFirst({ where: eq(userGamification.userId, userId) });
    if (gamification) {
      const streakEval = GamificationEngine.evaluateStreak(gamification.lastLoggedDate, todayDate, gamification.currentStreak, gamification.longestStreak);
      const newTotalXp = gamification.totalXp + 150;
      const newLevel = GamificationEngine.calculateLevel(newTotalXp);

      await db
        .update(userGamification)
        .set({
          currentStreak: streakEval.newStreak,
          longestStreak: streakEval.newLongestStreak,
          lastLoggedDate: todayDate,
          totalXp: newTotalXp,
          currentLevel: newLevel,
          updatedAt: new Date(),
        })
        .where(eq(userGamification.userId, userId));
    }

    return this.getDashboardData(userId);
  }

  /**
   * DEV/TEST ONLY: Seeds meals that intentionally exceed today's target by +320 kcal
   * to test the calorie target exceeded state.
   */
  static async seedExceededMeals(userId: string) {
    const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
    if (!user) throw new NotFoundError('User not found');
    const profile = await db.query.userProfiles.findFirst({ where: eq(userProfiles.userId, userId) });
    if (!profile) throw new NotFoundError('Profile not found');

    const todayDate = getLocalDateString(user.timezone);

    // Clean existing meals for today
    await db.delete(meals).where(and(eq(meals.userId, userId), eq(meals.logDate, todayDate)));

    const surplusCalories = profile.targetCalories + 320;
    const surplusProteinG = Math.round((surplusCalories * 0.3) / 4);
    const surplusCarbsG = Math.round((surplusCalories * 0.4) / 4);
    const surplusFatG = Math.round((surplusCalories * 0.3) / 9);

    const [insertedMeal] = await db
      .insert(meals)
      .values({
        userId,
        logDate: todayDate,
        mealSlot: 'dinner',
        dishName: 'Texas BBQ Platter & Loaded Mac (Surplus Feast)',
        totalCalories: surplusCalories,
        totalProteinG: surplusProteinG.toFixed(1),
        totalCarbsG: surplusCarbsG.toFixed(1),
        totalFatG: surplusFatG.toFixed(1),
        isAiGenerated: false,
        hasUserEdits: false,
      })
      .returning();

    await db.insert(mealItems).values({
      mealId: insertedMeal.id,
      name: 'Smoked Brisket & Macaroni',
      estimatedWeightG: '450.0',
      portionDescription: 'Large platter',
      calories: surplusCalories,
      proteinG: surplusProteinG.toFixed(1),
      carbsG: surplusCarbsG.toFixed(1),
      fatG: surplusFatG.toFixed(1),
      confidence: 'high',
      sortOrder: 1,
    });

    const existingSummary = await db.query.dailySummaries.findFirst({
      where: and(eq(dailySummaries.userId, userId), eq(dailySummaries.summaryDate, todayDate)),
    });

    if (existingSummary) {
      await db
        .update(dailySummaries)
        .set({
          consumedCalories: surplusCalories,
          consumedProteinG: surplusProteinG.toFixed(1),
          consumedCarbsG: surplusCarbsG.toFixed(1),
          consumedFatG: surplusFatG.toFixed(1),
          mealsLoggedCount: 1,
          isTargetMet: false,
          updatedAt: new Date(),
        })
        .where(eq(dailySummaries.id, existingSummary.id));
    }

    return this.getDashboardData(userId);
  }

  /**
   * DEV/TEST ONLY: Clears all meals logged today to test the zero-state.
   */
  static async clearTodayMeals(userId: string) {
    const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
    if (!user) throw new NotFoundError('User not found');

    const todayDate = getLocalDateString(user.timezone);

    await db.delete(meals).where(and(eq(meals.userId, userId), eq(meals.logDate, todayDate)));

    const existingSummary = await db.query.dailySummaries.findFirst({
      where: and(eq(dailySummaries.userId, userId), eq(dailySummaries.summaryDate, todayDate)),
    });

    if (existingSummary) {
      await db
        .update(dailySummaries)
        .set({
          consumedCalories: 0,
          consumedProteinG: '0',
          consumedCarbsG: '0',
          consumedFatG: '0',
          mealsLoggedCount: 0,
          isTargetMet: false,
          updatedAt: new Date(),
        })
        .where(eq(dailySummaries.id, existingSummary.id));
    }

    return this.getDashboardData(userId);
  }
}
