import test from 'node:test';
import assert from 'node:assert/strict';
import { buildServer } from '../src/server';
import { db } from '../src/database';
import { dailySummaries } from '../src/database/schema';
import { eq, and } from 'drizzle-orm';

test('Profile & Daily Calorie Goal System - Full Lifecycle and Historical Integrity', async () => {
  const server = await buildServer();
  const uniqueEmail = `profile_test_${Date.now()}@example.com`;
  const password = 'StrongPassword123!';
  const displayName = 'Profile Athlete';

  // 1. Register user
  const regRes = await server.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: { email: uniqueEmail, password, displayName },
  });
  assert.equal(regRes.statusCode, 201);
  const regData = JSON.parse(regRes.payload);
  const token = regData.data.accessToken;
  const userId = regData.data.user.id;

  // 2. Complete onboarding with initial biometrics:
  // Male, 80kg, 180cm, age approx 28, sedentary, weight_loss
  const onboardRes = await server.inject({
    method: 'POST',
    url: '/api/v1/users/onboarding',
    headers: { authorization: `Bearer ${token}` },
    payload: {
      gender: 'male',
      birthDate: '1998-01-01',
      heightCm: 180,
      weightKg: 80,
      activityLevel: 'sedentary',
      goal: 'weight_loss',
      timezone: 'UTC',
    },
  });
  assert.equal(onboardRes.statusCode, 200);

  // 3. Test GET /profile
  const getProfileRes = await server.inject({
    method: 'GET',
    url: '/api/v1/users/profile',
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(getProfileRes.statusCode, 200);
  const profileJson = JSON.parse(getProfileRes.payload);

  assert.equal(profileJson.data.profile.gender, 'male');
  assert.equal(profileJson.data.profile.heightCm, 180);
  assert.equal(profileJson.data.profile.weightKg, 80);
  assert.equal(profileJson.data.profile.activityLevel, 'sedentary');
  assert.equal(profileJson.data.profile.goal, 'weight_loss');
  assert.equal(profileJson.data.profile.isTargetOverridden, false);
  // Verify breakdown presence
  assert.ok(profileJson.data.targets.calculation.bmr > 1500);
  assert.ok(profileJson.data.targets.calculation.activityAdjustmentCalories >= 0);
  assert.ok(profileJson.data.targets.calculation.formula.name.includes('Mifflin-St Jeor'));
  assert.ok(profileJson.data.targets.calculation.disclaimer.includes('DISCLAIMER'));

  const initialRecommendedCalories = profileJson.data.targets.systemRecommended.calories;
  assert.equal(profileJson.data.profile.targetCalories, initialRecommendedCalories);

  // 4. Test POST /calculate-targets (Preview endpoint)
  const previewRes = await server.inject({
    method: 'POST',
    url: '/api/v1/users/calculate-targets',
    headers: { authorization: `Bearer ${token}` },
    payload: {
      gender: 'female',
      birthDate: '1995-06-15',
      heightCm: 165,
      weightKg: 60,
      activityLevel: 'very_active',
      goal: 'general_fitness',
    },
  });
  assert.equal(previewRes.statusCode, 200);
  const previewJson = JSON.parse(previewRes.payload);
  assert.equal(previewJson.data.goal, 'general_fitness');
  assert.equal(previewJson.data.goalAdjustmentCalories, 0); // General fitness is isocaloric
  assert.equal(previewJson.data.activityMultiplier, 1.725);
  assert.ok(previewJson.data.recommendedCalories > 2000);

  // 5. Test PUT /profile - Updating biometrics, activity level, and goal
  const updateRes = await server.inject({
    method: 'PUT',
    url: '/api/v1/users/profile',
    headers: { authorization: `Bearer ${token}` },
    payload: {
      displayName: 'Profile Champion',
      timezone: 'America/New_York',
      gender: 'male',
      birthDate: '1998-01-01',
      heightCm: 180,
      weightKg: 82, // gained 2kg
      activityLevel: 'moderate', // increased activity
      goal: 'general_fitness',
      isTargetOverridden: false,
    },
  });
  assert.equal(updateRes.statusCode, 200);
  const updateJson = JSON.parse(updateRes.payload);
  assert.equal(updateJson.data.user.displayName, 'Profile Champion');
  assert.equal(updateJson.data.user.timezone, 'America/New_York');
  assert.equal(updateJson.data.profile.goal, 'general_fitness');
  assert.equal(updateJson.data.profile.weightKg, 82);
  assert.ok(updateJson.data.profile.targetCalories > initialRecommendedCalories);

  const newRecommendedCalories = updateJson.data.profile.targetCalories;

  // 6. Test PUT /profile - Setting manual calorie override
  const overrideRes = await server.inject({
    method: 'PUT',
    url: '/api/v1/users/profile',
    headers: { authorization: `Bearer ${token}` },
    payload: {
      gender: 'male',
      birthDate: '1998-01-01',
      heightCm: 180,
      weightKg: 82,
      activityLevel: 'moderate',
      goal: 'general_fitness',
      isTargetOverridden: true,
      customCalories: 2750,
      customProteinG: 190,
      customCarbsG: 280,
      customFatG: 75,
    },
  });
  assert.equal(overrideRes.statusCode, 200);
  const overrideJson = JSON.parse(overrideRes.payload);
  assert.equal(overrideJson.data.profile.isTargetOverridden, true);
  // Verify system-recommended vs user-selected vs current active target distinction:
  assert.equal(overrideJson.data.targets.systemRecommended.calories, newRecommendedCalories);
  assert.equal(overrideJson.data.targets.userSelected.calories, 2750);
  assert.equal(overrideJson.data.targets.activeTarget.calories, 2750);
  assert.equal(overrideJson.data.profile.targetCalories, 2750);
  assert.equal(overrideJson.data.profile.targetProteinG, 190);

  // 7. Test GET /dashboard consumes active target
  const dashRes = await server.inject({
    method: 'GET',
    url: '/api/v1/users/dashboard',
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(dashRes.statusCode, 200);
  const dashJson = JSON.parse(dashRes.payload);
  assert.equal(dashJson.data.todaySummary.targetCalories, 2750);
  assert.equal(dashJson.data.targetContext.activeTargetCalories, 2750);
  assert.equal(dashJson.data.targetContext.isTargetOverridden, true);
  assert.equal(dashJson.data.targetContext.recommendedCalories, newRecommendedCalories);

  // 8. HISTORICAL TARGET INTEGRITY TEST
  // Seed a historical daily summary for a past date (e.g. '2026-09-15') with past target 1600 kcal
  const pastDate = '2026-09-15';
  await db.insert(dailySummaries).values({
    userId,
    summaryDate: pastDate,
    targetCalories: 1600,
    targetProteinG: '120.0',
    targetCarbsG: '160.0',
    targetFatG: '53.0',
    consumedCalories: 1580,
    consumedProteinG: '118.0',
    consumedCarbsG: '162.0',
    consumedFatG: '50.0',
    mealsLoggedCount: 3,
    isTargetMet: true,
  });

  // Now, user updates their profile again to a brand new target (e.g. 3200 kcal)
  const changeTargetRes = await server.inject({
    method: 'PUT',
    url: '/api/v1/users/profile',
    headers: { authorization: `Bearer ${token}` },
    payload: {
      gender: 'male',
      birthDate: '1998-01-01',
      heightCm: 180,
      weightKg: 82,
      activityLevel: 'moderate',
      goal: 'weight_gain',
      isTargetOverridden: true,
      customCalories: 3200,
      customProteinG: 220,
      customCarbsG: 350,
      customFatG: 90,
    },
  });
  assert.equal(changeTargetRes.statusCode, 200);

  // VERIFY: The historical day '2026-09-15' was NOT recalculated or overwritten!
  const pastSummary = await db.query.dailySummaries.findFirst({
    where: and(eq(dailySummaries.userId, userId), eq(dailySummaries.summaryDate, pastDate)),
  });
  assert.ok(pastSummary, 'Historical summary must exist');
  assert.equal(pastSummary.targetCalories, 1600, 'Historical target MUST remain 1600, NOT updated to 3200');
  assert.equal(Number(pastSummary.targetProteinG), 120.0, 'Historical target protein must be intact');
  assert.equal(pastSummary.consumedCalories, 1580);
  assert.equal(pastSummary.isTargetMet, true);

  // VERIFY: Today's summary DOES have the new target (3200 kcal)
  const todayDashRes = await server.inject({
    method: 'GET',
    url: '/api/v1/users/dashboard',
    headers: { authorization: `Bearer ${token}` },
  });
  const todayDashJson = JSON.parse(todayDashRes.payload);
  assert.equal(todayDashJson.data.todaySummary.targetCalories, 3200);

  await server.close();
});
