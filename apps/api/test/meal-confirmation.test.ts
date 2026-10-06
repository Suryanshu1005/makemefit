process.env.NODE_ENV = 'test';
process.env.AI_VISION_PROVIDER = 'mock';

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildServer } from '../src/server';
import { MockFoodVisionProvider } from '../src/modules/food-analysis/providers/mock-vision.provider';
import { db } from '../src/database';
import { meals } from '../src/database/schema/meals';
import { mealItems } from '../src/database/schema/meal_items';
import { dailySummaries } from '../src/database/schema/daily_summaries';
import { aiAnalyses } from '../src/database/schema/ai_analyses';
import { eq, and, isNull } from 'drizzle-orm';
import { MealEventBus, MealConfirmedEvent, getLocalDateString } from '../src/modules/food-logs/confirmed-meal.service';

function createMultipartPayload(fieldName: string, filename: string, mimeType: string, fileBuffer: Buffer) {
  const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
  const prefix = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="${fieldName}"; filename="${filename}"\r\nContent-Type: ${mimeType}\r\n\r\n`
  );
  const suffix = Buffer.from(`\r\n--${boundary}--\r\n`);
  const payload = Buffer.concat([prefix, fileBuffer, suffix]);
  const contentType = `multipart/form-data; boundary=${boundary}`;
  return { payload, contentType };
}

const VALID_JPEG_BUFFER = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48,
  0x00, 0x48, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43,
]);

test('Confirmed Meal Workflow & Daily Nutrition Integration Suite', async (t) => {
  const server = await buildServer();
  MockFoodVisionProvider.reset();
  MealEventBus.clearListeners();

  const userAEmail = `meal_confirm_a_${Date.now()}@example.com`;
  const userBEmail = `meal_confirm_b_${Date.now()}@example.com`;
  const password = 'StrongPassword123!';

  // Register User Alpha (Timezone: UTC)
  const regARes = await server.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: { email: userAEmail, password, displayName: 'Meal Logger Alpha' },
  });
  assert.equal(regARes.statusCode, 201);
  const userAId = JSON.parse(regARes.payload).data.user.id;
  const tokenA = JSON.parse(regARes.payload).data.accessToken;

  // Onboard User Alpha
  await server.inject({
    method: 'POST',
    url: '/api/v1/users/onboarding',
    headers: { authorization: `Bearer ${tokenA}` },
    payload: {
      gender: 'male',
      birthDate: '1995-05-15',
      heightCm: 180,
      weightKg: 80,
      activityLevel: 'moderate',
      goal: 'maintain',
      timezone: 'UTC',
    },
  });

  // Register User Beta (Tenant isolation attacker)
  const regBRes = await server.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: { email: userBEmail, password, displayName: 'Meal Logger Beta' },
  });
  assert.equal(regBRes.statusCode, 201);
  const tokenB = JSON.parse(regBRes.payload).data.accessToken;

  // Helper to upload and analyze image for User Alpha
  async function uploadAndAnalyzeMeal(fileName: string = 'lunch-bowl.jpg') {
    const { payload, contentType } = createMultipartPayload('file', fileName, 'image/jpeg', VALID_JPEG_BUFFER);
    const uploadRes = await server.inject({
      method: 'POST',
      url: '/api/v1/food-logs/upload',
      headers: { authorization: `Bearer ${tokenA}`, 'content-type': contentType },
      payload,
    });
    assert.equal(uploadRes.statusCode, 201);
    const uploadId = JSON.parse(uploadRes.payload).data.id;

    const analyzeRes = await server.inject({
      method: 'POST',
      url: `/api/v1/food-logs/uploads/${uploadId}/analyze`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    assert.equal(analyzeRes.statusCode, 200);
    const analysis = JSON.parse(analyzeRes.payload).data;

    const reviewRes = await server.inject({
      method: 'GET',
      url: `/api/v1/food-logs/uploads/${uploadId}/review`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    assert.equal(reviewRes.statusCode, 200);
    const reviewData = JSON.parse(reviewRes.payload).data;

    return { uploadId, analysisId: analysis.id || reviewData.analysisId, reviewData };
  }

  // Set up event bus listener to verify decoupled hooks
  const capturedEvents: MealConfirmedEvent[] = [];
  MealEventBus.subscribe((evt) => {
    capturedEvents.push(evt);
  });

  let firstMealId: string = '';
  let firstUploadData: Awaited<ReturnType<typeof uploadAndAnalyzeMeal>>;

  await t.test('1. Confirm a valid meal (AI estimates baseline)', async () => {
    firstUploadData = await uploadAndAnalyzeMeal('lunch1.jpg');

    const res = await server.inject({
      method: 'POST',
      url: `/api/v1/food-logs/uploads/${firstUploadData.uploadId}/confirm`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: {
        dishName: firstUploadData.reviewData.dishName,
        mealSlot: 'lunch',
        items: firstUploadData.reviewData.items,
        notes: 'Lunch at office',
      },
    });

    assert.equal(res.statusCode, 201);
    const body = JSON.parse(res.payload);
    assert.equal(body.success, true);
    assert.equal(body.data.meal.dishName, firstUploadData.reviewData.dishName);
    assert.equal(body.data.meal.mealSlot, 'lunch');
    assert.equal(body.data.meal.totalCalories, 634);
    assert.equal(body.data.meal.totalProteinG, 58.1);
    assert.equal(body.data.meal.totalCarbsG, 58.2);
    assert.equal(body.data.meal.totalFatG, 18.7);
    assert.equal(body.data.meal.hasUserEdits, false);
    assert.equal(body.data.meal.items.length, 4);

    firstMealId = body.data.meal.id;

    // Verify database record in meals table
    const [dbMeal] = await db.select().from(meals).where(eq(meals.id, firstMealId));
    assert.ok(dbMeal);
    assert.equal(dbMeal.userId, userAId);
    assert.equal(dbMeal.totalCalories, 634);
    assert.equal(dbMeal.isAiGenerated, true);
    assert.equal(dbMeal.hasUserEdits, false);

    // Verify meal items in database
    const dbItems = await db.select().from(mealItems).where(eq(mealItems.mealId, firstMealId));
    assert.equal(dbItems.length, 4);

    // Verify decoupled event hook was triggered
    assert.equal(capturedEvents.length, 1);
    assert.equal(capturedEvents[0].mealId, firstMealId);
    assert.equal(capturedEvents[0].totals.totalCalories, 634);
  });

  await t.test('2. Confirm a corrected AI result (User modifications preserved alongside original AI baseline)', async () => {
    const uploadData = await uploadAndAnalyzeMeal('dinner1.jpg');

    // Modify: Cut rice in half (109 kcal), add a side apple (95 kcal)
    const modifiedItems = uploadData.reviewData.items.map((item: any) => {
      if (item.name.toLowerCase().includes('rice')) {
        return {
          ...item,
          quantity: 0.5,
          estimatedWeightG: 100,
          calories: 109,
          proteinG: 2.5,
          carbsG: 23,
          fatG: 1,
          isUserModified: true,
        };
      }
      return item;
    });

    modifiedItems.push({
      id: 'custom-apple',
      name: 'Fresh Red Apple',
      quantity: 1,
      unit: 'medium apple',
      estimatedWeightG: 182,
      calories: 95,
      proteinG: 0.5,
      carbsG: 25,
      fatG: 0.3,
      isUserModified: true,
      isUserAdded: true,
      originalAiItemData: null,
    });

    const res = await server.inject({
      method: 'POST',
      url: `/api/v1/food-logs/uploads/${uploadData.uploadId}/confirm`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: {
        dishName: 'Light Chicken & Apple Dinner',
        mealSlot: 'dinner',
        items: modifiedItems,
        notes: 'Reduced carbs, added fruit',
      },
    });

    assert.equal(res.statusCode, 201);
    const body = JSON.parse(res.payload);
    assert.equal(body.success, true);
    assert.equal(body.data.meal.dishName, 'Light Chicken & Apple Dinner');
    assert.equal(body.data.meal.hasUserEdits, true);
    // 634 - 109 + 95 = 620 kcal
    assert.equal(body.data.meal.totalCalories, 620);
    assert.equal(body.data.meal.items.length, 5);

    // Verify original AI estimate remains unaltered in database
    const [analysisRecord] = await db
      .select()
      .from(aiAnalyses)
      .where(eq(aiAnalyses.id, uploadData.analysisId));
    assert.ok(analysisRecord);
    const normalizedData = analysisRecord.normalizedData as any;
    assert.equal(normalizedData.totals.totalCalories, 634); // Unaltered AI original
  });

  await t.test('3. Verify today\'s daily totals updated (sum of lunch 634 + dinner 620 = 1254 kcal)', async () => {
    const todayStr = getLocalDateString('UTC');
    const [summary] = await db
      .select()
      .from(dailySummaries)
      .where(and(eq(dailySummaries.userId, userAId), eq(dailySummaries.summaryDate, todayStr)));

    assert.ok(summary);
    assert.equal(summary.consumedCalories, 1254);
    assert.equal(summary.mealsLoggedCount, 2);
    assert.equal(Number(summary.consumedProteinG), 114.7);
    assert.equal(Number(summary.consumedCarbsG), 118.6);
    assert.equal(Number(summary.consumedFatG), 37.1);
  });

  await t.test('4. Multiple meals in one day (breakfast + lunch + dinner)', async () => {
    const uploadData = await uploadAndAnalyzeMeal('snack1.jpg');

    const res = await server.inject({
      method: 'POST',
      url: `/api/v1/food-logs/uploads/${uploadData.uploadId}/confirm`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: {
        dishName: 'Evening Protein Snack',
        mealSlot: 'snack',
        items: [
          {
            id: 'snack-item-1',
            name: 'Greek Yogurt Bowl',
            quantity: 1,
            unit: 'cup',
            estimatedWeightG: 200,
            calories: 150,
            proteinG: 18.0,
            carbsG: 8.0,
            fatG: 4.0,
          },
        ],
      },
    });

    assert.equal(res.statusCode, 201);
    const body = JSON.parse(res.payload);
    assert.equal(body.data.todaySummary.mealsLoggedCount, 3);
    // 1254 + 150 = 1404 kcal
    assert.equal(body.data.todaySummary.consumedCalories, 1404);
  });

  await t.test('5. Meal history and day retrieval endpoints', async () => {
    const todayStr = getLocalDateString('UTC');

    // 5a. GET /food-logs/summary
    const summaryRes = await server.inject({
      method: 'GET',
      url: `/api/v1/food-logs/summary?date=${todayStr}`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    assert.equal(summaryRes.statusCode, 200);
    const summaryBody = JSON.parse(summaryRes.payload);
    assert.equal(summaryBody.data.consumedCalories, 1404);
    assert.equal(summaryBody.data.mealsLoggedCount, 3);

    // 5b. GET /food-logs/history
    const historyRes = await server.inject({
      method: 'GET',
      url: '/api/v1/food-logs/history?days=7',
      headers: { authorization: `Bearer ${tokenA}` },
    });
    assert.equal(historyRes.statusCode, 200);
    const historyBody = JSON.parse(historyRes.payload);
    assert.ok(Array.isArray(historyBody.data));
    assert.ok(historyBody.data.length >= 1);
    assert.equal(historyBody.data[0].summaryDate, todayStr);

    // 5c. GET /food-logs/meals
    const mealsRes = await server.inject({
      method: 'GET',
      url: `/api/v1/food-logs/meals?date=${todayStr}`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    assert.equal(mealsRes.statusCode, 200);
    const mealsBody = JSON.parse(mealsRes.payload);
    assert.equal(mealsBody.data.length, 3);

    // 5d. GET /food-logs/meals/:id
    const singleMealRes = await server.inject({
      method: 'GET',
      url: `/api/v1/food-logs/meals/${firstMealId}`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    assert.equal(singleMealRes.statusCode, 200);
    const singleMealBody = JSON.parse(singleMealRes.payload);
    assert.equal(singleMealBody.data.id, firstMealId);
    assert.equal(singleMealBody.data.items.length, 4);
  });

  await t.test('6. User timezone handling (Indian Standard Time UTC+5:30)', async () => {
    const userKolkataEmail = `kolkata_user_${Date.now()}@example.com`;
    const regRes = await server.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: userKolkataEmail, password, displayName: 'Kolkata Athlete' },
    });
    assert.equal(regRes.statusCode, 201);
    const tokenKolkata = JSON.parse(regRes.payload).data.accessToken;

    await server.inject({
      method: 'POST',
      url: '/api/v1/users/onboarding',
      headers: { authorization: `Bearer ${tokenKolkata}` },
      payload: {
        gender: 'male',
        birthDate: '1992-10-10',
        heightCm: 175,
        weightKg: 72,
        activityLevel: 'active',
        goal: 'gain',
        timezone: 'Asia/Kolkata',
      },
    });

    const expectedKolkataDate = getLocalDateString('Asia/Kolkata', new Date());

    // Upload & analyze
    const { payload, contentType } = createMultipartPayload('file', 'dosa.jpg', 'image/jpeg', VALID_JPEG_BUFFER);
    const uploadRes = await server.inject({
      method: 'POST',
      url: '/api/v1/food-logs/upload',
      headers: { authorization: `Bearer ${tokenKolkata}`, 'content-type': contentType },
      payload,
    });
    const uploadId = JSON.parse(uploadRes.payload).data.id;

    await server.inject({
      method: 'POST',
      url: `/api/v1/food-logs/uploads/${uploadId}/analyze`,
      headers: { authorization: `Bearer ${tokenKolkata}` },
    });

    const reviewRes = await server.inject({
      method: 'GET',
      url: `/api/v1/food-logs/uploads/${uploadId}/review`,
      headers: { authorization: `Bearer ${tokenKolkata}` },
    });
    const reviewData = JSON.parse(reviewRes.payload).data;

    // Confirm without logDate param (should default to user's local timezone date)
    const confirmRes = await server.inject({
      method: 'POST',
      url: `/api/v1/food-logs/uploads/${uploadId}/confirm`,
      headers: { authorization: `Bearer ${tokenKolkata}` },
      payload: {
        dishName: 'Masala Dosa with Sambar',
        mealSlot: 'breakfast',
        items: reviewData.items,
      },
    });

    assert.equal(confirmRes.statusCode, 201);
    const confirmBody = JSON.parse(confirmRes.payload);
    assert.equal(confirmBody.data.meal.logDate, expectedKolkataDate);
    assert.equal(confirmBody.data.todaySummary.summaryDate, expectedKolkataDate);
  });

  await t.test('7. Day-boundary behavior across midnight', async () => {
    const fixedUtcTime = new Date('2026-10-06T19:30:00.000Z'); // 7:30 PM UTC
    // In UTC, date is 2026-10-06
    assert.equal(getLocalDateString('UTC', fixedUtcTime), '2026-10-06');
    // In Asia/Kolkata (+5:30), 19:30 UTC is 01:00 AM on 2026-10-07
    assert.equal(getLocalDateString('Asia/Kolkata', fixedUtcTime), '2026-10-07');
    // In America/New_York (-4:00 EDT), 19:30 UTC is 15:30 on 2026-10-06
    assert.equal(getLocalDateString('America/New_York', fixedUtcTime), '2026-10-06');
  });

  await t.test('8. Duplicate confirmation prevention (Rejects double-confirmation with 409 Conflict)', async () => {
    // Attempting to confirm firstUploadData again
    const res = await server.inject({
      method: 'POST',
      url: `/api/v1/food-logs/uploads/${firstUploadData.uploadId}/confirm`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: {
        dishName: firstUploadData.reviewData.dishName,
        mealSlot: 'lunch',
        items: firstUploadData.reviewData.items,
      },
    });

    assert.equal(res.statusCode, 409);
    const body = JSON.parse(res.payload);
    assert.equal(body.error.code, 'CONFLICT');
    assert.match(body.error.message, /already been confirmed/i);

    // Verify count in database did not increment
    const mealRows = await db
      .select()
      .from(meals)
      .where(and(eq(meals.aiAnalysisId, firstUploadData.analysisId), isNull(meals.deletedAt)));
    assert.equal(mealRows.length, 1);
  });

  await t.test('9. Failed transaction rollback (Does not leave partial or orphaned records)', async () => {
    const uploadData = await uploadAndAnalyzeMeal('broken-item.jpg');

    // Send item with corrupted negative estimated weight that passes zod if coerced but fails validation
    const res = await server.inject({
      method: 'POST',
      url: `/api/v1/food-logs/uploads/${uploadData.uploadId}/confirm`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: {
        dishName: 'Broken Meal',
        mealSlot: 'lunch',
        items: [
          {
            id: 'valid-item',
            name: 'Valid Soup',
            quantity: 1,
            unit: 'bowl',
            estimatedWeightG: -50, // Invalid negative weight
            calories: 100,
            proteinG: 5,
            carbsG: 10,
            fatG: 2,
          },
        ],
      },
    });

    assert.equal(res.statusCode, 400);

    // Verify no meal was created for this analysis
    const mealRows = await db
      .select()
      .from(meals)
      .where(eq(meals.aiAnalysisId, uploadData.analysisId));
    assert.equal(mealRows.length, 0);
  });

  await t.test('10. Unauthorized confirmation (Tenant isolation: User Beta blocked from User Alpha upload)', async () => {
    const uploadData = await uploadAndAnalyzeMeal('private-lunch.jpg');

    // User Beta tries to confirm User Alpha's upload
    const res = await server.inject({
      method: 'POST',
      url: `/api/v1/food-logs/uploads/${uploadData.uploadId}/confirm`,
      headers: { authorization: `Bearer ${tokenB}` },
      payload: {
        dishName: 'Stolen Lunch',
        mealSlot: 'lunch',
        items: uploadData.reviewData.items,
      },
    });

    assert.equal(res.statusCode, 403);
    const body = JSON.parse(res.payload);
    assert.equal(body.error.code, 'FORBIDDEN');

    // Unauthenticated request
    const noAuthRes = await server.inject({
      method: 'POST',
      url: `/api/v1/food-logs/uploads/${uploadData.uploadId}/confirm`,
      payload: {
        dishName: 'Unauth Lunch',
        mealSlot: 'lunch',
        items: uploadData.reviewData.items,
      },
    });
    assert.equal(noAuthRes.statusCode, 401);
  });

  await t.test('11. Invalid nutrition values rejected', async () => {
    const uploadData = await uploadAndAnalyzeMeal('invalid-nutrition.jpg');

    // 11a. Negative calories
    const negCalRes = await server.inject({
      method: 'POST',
      url: `/api/v1/food-logs/uploads/${uploadData.uploadId}/confirm`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: {
        dishName: 'Invalid Calorie Dish',
        mealSlot: 'lunch',
        items: [
          {
            id: 'neg-cal',
            name: 'Negative Calorie Dish',
            quantity: 1,
            unit: 'serving',
            estimatedWeightG: 100,
            calories: -50,
            proteinG: 10,
            carbsG: 10,
            fatG: 2,
          },
        ],
      },
    });
    assert.equal(negCalRes.statusCode, 400);

    // 11b. Empty item list
    const emptyItemsRes = await server.inject({
      method: 'POST',
      url: `/api/v1/food-logs/uploads/${uploadData.uploadId}/confirm`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: {
        dishName: 'Empty Meal',
        mealSlot: 'lunch',
        items: [],
      },
    });
    assert.equal(emptyItemsRes.statusCode, 400);

    // 11c. Empty dish name
    const emptyDishRes = await server.inject({
      method: 'POST',
      url: `/api/v1/food-logs/uploads/${uploadData.uploadId}/confirm`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: {
        dishName: '   ',
        mealSlot: 'lunch',
        items: uploadData.reviewData.items,
      },
    });
    assert.equal(emptyDishRes.statusCode, 400);
  });

  await t.test('12. Dashboard endpoint refresh returns updated calories, macros, and meals list', async () => {
    const res = await server.inject({
      method: 'GET',
      url: '/api/v1/users/dashboard',
      headers: { authorization: `Bearer ${tokenA}` },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.equal(body.success, true);
    assert.equal(body.data.todaySummary.consumedCalories, 1404);
    assert.equal(body.data.todaySummary.mealsLoggedCount, 3);
    assert.equal(body.data.meals.length, 3);
    assert.equal(body.data.meals[2].id, firstMealId);
    assert.equal(body.data.meals[2].dishName, firstUploadData.reviewData.dishName);
  });
});
