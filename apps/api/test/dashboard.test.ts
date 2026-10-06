import test from 'node:test';
import assert from 'node:assert/strict';
import { buildServer } from '../src/server';

test('Primary Dashboard - Real Database Data, Zero State, Totals, Exceeded State, and Timezone', async () => {
  const server = await buildServer();
  const uniqueEmail = `dashboard_athlete_${Date.now()}@example.com`;
  const password = 'StrongPassword123!';
  const displayName = 'Dashboard Pro';

  // 1. Register user
  const regRes = await server.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: { email: uniqueEmail, password, displayName },
  });
  assert.equal(regRes.statusCode, 201);
  const token = JSON.parse(regRes.payload).data.accessToken;

  // 2. Complete onboarding with timezone 'America/Los_Angeles'
  const onboardRes = await server.inject({
    method: 'POST',
    url: '/api/v1/users/onboarding',
    headers: { authorization: `Bearer ${token}` },
    payload: {
      gender: 'female',
      birthDate: '1996-03-20',
      heightCm: 168,
      weightKg: 62,
      activityLevel: 'moderate',
      goal: 'weight_loss',
      timezone: 'America/Los_Angeles',
    },
  });
  assert.equal(onboardRes.statusCode, 200);

  // 3. ZERO-STATE DASHBOARD VERIFICATION
  const zeroDashRes = await server.inject({
    method: 'GET',
    url: '/api/v1/users/dashboard',
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(zeroDashRes.statusCode, 200);
  const zeroDash = JSON.parse(zeroDashRes.payload).data;

  // Assert user & timezone
  assert.equal(zeroDash.user.displayName, displayName);
  assert.equal(zeroDash.user.timezone, 'America/Los_Angeles');

  // Assert zero state numbers
  assert.equal(zeroDash.todaySummary.consumedCalories, 0);
  assert.equal(zeroDash.todaySummary.consumedProteinG, 0);
  assert.equal(zeroDash.todaySummary.consumedCarbsG, 0);
  assert.equal(zeroDash.todaySummary.consumedFatG, 0);
  assert.equal(zeroDash.todaySummary.mealsLoggedCount, 0);
  assert.equal(zeroDash.todaySummary.remainingCalories, zeroDash.todaySummary.targetCalories);
  assert.equal(zeroDash.todaySummary.isTargetMet, false);
  assert.equal(zeroDash.meals.length, 0, 'Zero state must have 0 meals');

  // Gamification presence
  assert.equal(zeroDash.gamification.currentStreak >= 0, true);
  assert.equal(zeroDash.gamification.currentLevel, 1);
  assert.ok(zeroDash.gamification.nextLevelCeiling > 0);

  // 4. SEED REAL DEMO MEALS IN DATABASE
  const seedRes = await server.inject({
    method: 'POST',
    url: '/api/v1/users/demo/seed-meals',
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(seedRes.statusCode, 200);
  const seededDash = JSON.parse(seedRes.payload).data;

  // Verify real database records populated
  assert.equal(seededDash.meals.length, 3, 'Seeded 3 real database meals');
  assert.equal(seededDash.todaySummary.mealsLoggedCount, 3);
  assert.equal(seededDash.todaySummary.consumedCalories, 1380);
  assert.equal(seededDash.todaySummary.consumedProteinG, 106);
  assert.equal(seededDash.todaySummary.consumedCarbsG, 114);
  assert.equal(seededDash.todaySummary.consumedFatG, 54);

  // Verify meal 1 has real items
  const breakfast = seededDash.meals.find((m: any) => m.mealSlot === 'breakfast');
  assert.ok(breakfast, 'Breakfast exists');
  assert.equal(breakfast.dishName, 'Avocado Toast & Poached Eggs');
  assert.equal(breakfast.totalCalories, 450);
  assert.ok(breakfast.items.length >= 3, 'Breakfast items exist in meal_items table');

  // Remaining calories calculation
  const targetCalories = seededDash.todaySummary.targetCalories;
  assert.equal(seededDash.todaySummary.remainingCalories, Math.max(0, targetCalories - 1380));

  // XP incremented (+150 XP for 3 meals)
  assert.equal(seededDash.gamification.totalXp, 150);
  assert.equal(seededDash.gamification.currentLevel, 2, '150 XP crosses Level 2 threshold (100 XP)');

  // 5. TEST TARGET EXCEEDED STATE
  const exceedRes = await server.inject({
    method: 'POST',
    url: '/api/v1/users/demo/exceed-target',
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(exceedRes.statusCode, 200);
  const exceedDash = JSON.parse(exceedRes.payload).data;

  // Verify consumed > target
  assert.ok(exceedDash.todaySummary.consumedCalories > exceedDash.todaySummary.targetCalories);
  assert.equal(exceedDash.todaySummary.consumedCalories, exceedDash.todaySummary.targetCalories + 320);
  assert.equal(exceedDash.todaySummary.remainingCalories, 0, 'When exceeded, remaining is 0');

  // 6. TEST CLEAR MEALS (RETURN TO ZERO STATE)
  const clearRes = await server.inject({
    method: 'DELETE',
    url: '/api/v1/users/demo/meals',
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(clearRes.statusCode, 200);
  const clearedDash = JSON.parse(clearRes.payload).data;

  assert.equal(clearedDash.meals.length, 0);
  assert.equal(clearedDash.todaySummary.consumedCalories, 0);
  assert.equal(clearedDash.todaySummary.remainingCalories, clearedDash.todaySummary.targetCalories);

  await server.close();
});
