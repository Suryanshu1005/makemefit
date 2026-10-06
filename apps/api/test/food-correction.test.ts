process.env.NODE_ENV = 'test';
process.env.AI_VISION_PROVIDER = 'mock';

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildServer } from '../src/server';
import { MockFoodVisionProvider } from '../src/modules/food-analysis/providers/mock-vision.provider';
import { db } from '../src/database';
import { aiAnalyses } from '../src/database/schema/ai_analyses';
import { eq } from 'drizzle-orm';
import { EditableFoodItem } from '@makemefit/shared';

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

test('AI Nutrition Review and Manual Correction Integration Suite', async (t) => {
  const server = await buildServer();
  MockFoodVisionProvider.reset();

  const userAEmail = `correction_user_a_${Date.now()}@example.com`;
  const userBEmail = `correction_user_b_${Date.now()}@example.com`;
  const password = 'StrongPassword123!';

  // User Alpha
  const regARes = await server.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: { email: userAEmail, password, displayName: 'Reviewer Alpha' },
  });
  assert.equal(regARes.statusCode, 201);
  const tokenA = JSON.parse(regARes.payload).data.accessToken;

  await server.inject({
    method: 'POST',
    url: '/api/v1/users/onboarding',
    headers: { authorization: `Bearer ${tokenA}` },
    payload: {
      gender: 'female',
      birthDate: '1998-07-22',
      heightCm: 165,
      weightKg: 58,
      activityLevel: 'moderate',
      goal: 'weight_loss',
      timezone: 'UTC',
    },
  });

  // User Beta
  const regBRes = await server.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: { email: userBEmail, password, displayName: 'Reviewer Beta' },
  });
  assert.equal(regBRes.statusCode, 201);
  const tokenB = JSON.parse(regBRes.payload).data.accessToken;

  // 1. Upload and analyze meal image for User Alpha
  const { payload, contentType } = createMultipartPayload('file', 'dinner-bowl.jpg', 'image/jpeg', VALID_JPEG_BUFFER);
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

  let initialReviewItems: EditableFoodItem[] = [];

  await t.test('1. Get Initial Review Data (AI estimates baseline with audit snapshots)', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/api/v1/food-logs/uploads/${uploadId}/review`,
      headers: { authorization: `Bearer ${tokenA}` },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.equal(body.success, true);
    assert.equal(body.data.uploadId, uploadId);
    assert.equal(body.data.hasSavedDraft, false);
    assert.equal(body.data.dishName, 'Grilled Chicken Bowl with Brown Rice & Avocado');
    assert.equal(body.data.currentTotals.totalCalories, 634);
    assert.equal(body.data.originalAiTotals.totalCalories, 634);

    initialReviewItems = body.data.items;
    assert.equal(initialReviewItems.length, 4);

    // Verify each item preserves original AI snapshot and is initially unmodified
    for (const item of initialReviewItems) {
      assert.equal(item.isUserModified, false);
      assert.equal(item.isUserAdded, false);
      assert.ok(item.originalAiItemData, 'Item must have original AI snapshot');
      assert.equal(item.calories, item.originalAiItemData.calories);
    }
  });

  await t.test('2. Edit One Item (e.g. Brown Rice: 1 cup 218 kcal -> 0.5 cup 109 kcal)', async () => {
    const riceIndex = initialReviewItems.findIndex((i) => i.name.includes('Brown Rice'));
    assert.ok(riceIndex >= 0);

    // Deep clone items
    const editedItems = JSON.parse(JSON.stringify(initialReviewItems)) as EditableFoodItem[];
    editedItems[riceIndex].quantity = 0.5;
    editedItems[riceIndex].calories = 109;
    editedItems[riceIndex].carbsG = 22.9;
    editedItems[riceIndex].estimatedWeightG = 98;

    const res = await server.inject({
      method: 'PUT',
      url: `/api/v1/food-logs/uploads/${uploadId}/corrections`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: {
        dishName: 'Custom Chicken & Brown Rice Bowl',
        mealSlot: 'dinner',
        items: editedItems,
        userNotes: 'Ate half portion of rice',
      },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.equal(body.data.hasUserModifications, true);

    // Check rice item is flagged as user modified
    const returnedRice = body.data.items.find((i: any) => i.name.includes('Brown Rice'));
    assert.equal(returnedRice.isUserModified, true);
    assert.equal(returnedRice.calories, 109);
    assert.equal(returnedRice.originalAiItemData.calories, 218, 'Original AI value must be preserved in snapshot');

    // Authoritative recalculated totals: 634 - (218 - 109) = 525 kcal
    assert.equal(body.data.serverTotals.totalCalories, 525);
    assert.equal(body.data.originalAiTotals.totalCalories, 634);
  });

  await t.test('3. Add an Item (e.g. Unsweetened Iced Tea 2 kcal)', async () => {
    // Fetch current draft
    const reviewRes = await server.inject({
      method: 'GET',
      url: `/api/v1/food-logs/uploads/${uploadId}/review`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    const currentItems = JSON.parse(reviewRes.payload).data.items as EditableFoodItem[];

    const newItem: EditableFoodItem = {
      id: 'user-added-item-1',
      name: 'Unsweetened Iced Tea',
      quantity: 1,
      unit: 'glass',
      estimatedWeightG: 300,
      calories: 2,
      proteinG: 0,
      carbsG: 0.5,
      fatG: 0,
      isUserModified: true,
      isUserAdded: true,
      notes: 'No sugar added',
    };

    const updatedItems = [...currentItems, newItem];

    const res = await server.inject({
      method: 'PUT',
      url: `/api/v1/food-logs/uploads/${uploadId}/corrections`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: {
        dishName: 'Custom Chicken Bowl + Tea',
        mealSlot: 'dinner',
        items: updatedItems,
      },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.equal(body.data.items.length, 5);

    const tea = body.data.items.find((i: any) => i.name === 'Unsweetened Iced Tea');
    assert.ok(tea);
    assert.equal(tea.isUserAdded, true);
    assert.equal(tea.isUserModified, true);

    // Total calories: 525 + 2 = 527
    assert.equal(body.data.serverTotals.totalCalories, 527);
  });

  await t.test('4. Delete an Item (e.g. Remove Steamed Broccoli)', async () => {
    const reviewRes = await server.inject({
      method: 'GET',
      url: `/api/v1/food-logs/uploads/${uploadId}/review`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    const currentItems = JSON.parse(reviewRes.payload).data.items as EditableFoodItem[];

    // Filter out Broccoli (31 kcal)
    const itemsWithoutBroccoli = currentItems.filter((i) => !i.name.includes('Broccoli'));
    assert.equal(itemsWithoutBroccoli.length, 4);

    const res = await server.inject({
      method: 'PUT',
      url: `/api/v1/food-logs/uploads/${uploadId}/corrections`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: {
        dishName: 'Chicken & Rice No Veggies',
        mealSlot: 'dinner',
        items: itemsWithoutBroccoli,
      },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.equal(body.data.items.length, 4);
    assert.ok(!body.data.items.some((i: any) => i.name.includes('Broccoli')));

    // Total calories: 527 - 31 = 496
    assert.equal(body.data.serverTotals.totalCalories, 496);
  });

  await t.test('5. Duplicate an Item (e.g. Duplicate Avocado for Double Portion)', async () => {
    const reviewRes = await server.inject({
      method: 'GET',
      url: `/api/v1/food-logs/uploads/${uploadId}/review`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    const currentItems = JSON.parse(reviewRes.payload).data.items as EditableFoodItem[];

    const avocado = currentItems.find((i) => i.name.includes('Avocado'))!;
    const duplicateAvocado: EditableFoodItem = {
      ...avocado,
      id: 'duplicate-avocado-2',
      notes: 'Second portion on the side',
      isUserAdded: true,
      isUserModified: true,
    };

    const res = await server.inject({
      method: 'PUT',
      url: `/api/v1/food-logs/uploads/${uploadId}/corrections`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: {
        dishName: 'Extra Avocado Bowl',
        mealSlot: 'dinner',
        items: [...currentItems, duplicateAvocado],
      },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.equal(body.data.items.length, 5);

    // 496 + 120 = 616 kcal
    assert.equal(body.data.serverTotals.totalCalories, 616);
  });

  await t.test('6. Verify Original AI Values in PostgreSQL are NEVER Overwritten', async () => {
    const [dbRow] = await db.select().from(aiAnalyses).where(eq(aiAnalyses.uploadId, uploadId));
    assert.ok(dbRow);

    // 1. Raw response payload must exist unaltered
    assert.ok(dbRow.rawResponsePayload);

    // 2. Normalized AI data must still have the original 4 items and 634 kcal
    const originalNormalized = dbRow.normalizedData as any;
    assert.equal(originalNormalized.items.length, 4);
    assert.equal(originalNormalized.totals.totalCalories, 634);
    assert.equal(originalNormalized.dishName, 'Grilled Chicken Bowl with Brown Rice & Avocado');

    // 3. User corrected payload must be stored separately
    assert.ok(dbRow.userCorrectedPayload);
    assert.equal(dbRow.hasUserCorrections, true);
    assert.equal((dbRow.userCorrectedPayload as any).serverTotals.totalCalories, 616);
  });

  await t.test('7. Server-Side Validation: Rejects Negative Calories and Macros', async () => {
    const reviewRes = await server.inject({
      method: 'GET',
      url: `/api/v1/food-logs/uploads/${uploadId}/review`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    const items = JSON.parse(reviewRes.payload).data.items as EditableFoodItem[];

    // Negative calories
    const invalidItems = JSON.parse(JSON.stringify(items));
    invalidItems[0].calories = -50;

    const res = await server.inject({
      method: 'PUT',
      url: `/api/v1/food-logs/uploads/${uploadId}/corrections`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: {
        dishName: 'Invalid Negative Dish',
        mealSlot: 'dinner',
        items: invalidItems,
      },
    });

    assert.equal(res.statusCode, 400);
    const body = JSON.parse(res.payload);
    assert.equal(body.error.code, 'VALIDATION_ERROR');
  });

  await t.test('8. Server-Side Validation: Rejects Empty Food Name and Empty Items Array', async () => {
    // Empty name
    const res1 = await server.inject({
      method: 'PUT',
      url: `/api/v1/food-logs/uploads/${uploadId}/corrections`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: {
        dishName: '',
        mealSlot: 'lunch',
        items: [
          {
            id: '1',
            name: '',
            quantity: 1,
            unit: 'piece',
            estimatedWeightG: 100,
            calories: 100,
            proteinG: 10,
            carbsG: 10,
            fatG: 1,
          },
        ],
      },
    });
    assert.equal(res1.statusCode, 400);

    // Empty items
    const res2 = await server.inject({
      method: 'PUT',
      url: `/api/v1/food-logs/uploads/${uploadId}/corrections`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: {
        dishName: 'No Food',
        mealSlot: 'lunch',
        items: [],
      },
    });
    assert.equal(res2.statusCode, 400);
  });

  await t.test('9. Security & Authorization: User Beta cannot access or modify User Alpha corrections', async () => {
    // User Beta attempts to read User Alpha review data
    const getRes = await server.inject({
      method: 'GET',
      url: `/api/v1/food-logs/uploads/${uploadId}/review`,
      headers: { authorization: `Bearer ${tokenB}` },
    });
    assert.equal(getRes.statusCode, 404);

    // User Beta attempts to modify User Alpha review data
    const putRes = await server.inject({
      method: 'PUT',
      url: `/api/v1/food-logs/uploads/${uploadId}/corrections`,
      headers: { authorization: `Bearer ${tokenB}` },
      payload: {
        dishName: 'Hacked Meal',
        mealSlot: 'dinner',
        items: [
          {
            id: '1',
            name: 'Pizza',
            quantity: 1,
            unit: 'slice',
            estimatedWeightG: 150,
            calories: 300,
            proteinG: 12,
            carbsG: 35,
            fatG: 14,
          },
        ],
      },
    });
    assert.equal(putRes.statusCode, 404);
  });

  await t.test('10. Calorie Isolation: Daily Calorie Budget Remains 0 (Unconfirmed)', async () => {
    const dashRes = await server.inject({
      method: 'GET',
      url: '/api/v1/users/dashboard',
      headers: { authorization: `Bearer ${tokenA}` },
    });
    const dash = JSON.parse(dashRes.payload).data;
    assert.equal(dash.todaySummary.consumedCalories, 0, 'Corrections must not touch consumed calories');
    assert.equal(dash.todaySummary.mealsLoggedCount, 0);
  });
});
