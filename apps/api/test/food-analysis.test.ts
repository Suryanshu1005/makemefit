process.env.NODE_ENV = 'test';
process.env.AI_VISION_PROVIDER = 'mock';

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildServer } from '../src/server';
import { MockFoodVisionProvider } from '../src/modules/food-analysis/providers/mock-vision.provider';
import { db } from '../src/database';
import { aiAnalyses } from '../src/database/schema/ai_analyses';
import { eq } from 'drizzle-orm';

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

// Minimal valid JPEG header (SOI, APP0 marker)
const VALID_JPEG_BUFFER = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48,
  0x00, 0x48, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43,
]);

test('AI-Powered Food Image Analysis Pipeline Suite', async (t) => {
  const server = await buildServer();

  // Reset any mock scenario overrides before starting
  MockFoodVisionProvider.reset();

  // Create two distinct users for multi-tenant isolation testing
  const userAEmail = `food_ai_alpha_${Date.now()}@example.com`;
  const userBEmail = `food_ai_beta_${Date.now()}@example.com`;
  const password = 'StrongPassword123!';

  // User Alpha registration & onboarding
  const regARes = await server.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: { email: userAEmail, password, displayName: 'Alpha Foodie' },
  });
  assert.equal(regARes.statusCode, 201);
  const tokenA = JSON.parse(regARes.payload).data.accessToken;

  await server.inject({
    method: 'POST',
    url: '/api/v1/users/onboarding',
    headers: { authorization: `Bearer ${tokenA}` },
    payload: {
      gender: 'male',
      birthDate: '1995-05-15',
      heightCm: 180,
      weightKg: 78,
      activityLevel: 'moderate',
      goal: 'maintenance',
      timezone: 'UTC',
    },
  });

  // User Beta registration
  const regBRes = await server.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: { email: userBEmail, password, displayName: 'Beta Foodie' },
  });
  assert.equal(regBRes.statusCode, 201);
  const tokenB = JSON.parse(regBRes.payload).data.accessToken;

  // Helper function to upload an image for User Alpha
  async function uploadImageForUser(fileName = 'bowl.jpg'): Promise<string> {
    const { payload, contentType } = createMultipartPayload('file', fileName, 'image/jpeg', VALID_JPEG_BUFFER);
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/food-logs/upload',
      headers: { authorization: `Bearer ${tokenA}`, 'content-type': contentType },
      payload,
    });
    assert.equal(res.statusCode, 201);
    return JSON.parse(res.payload).data.id;
  }

  const primaryUploadId = await uploadImageForUser('healthy-lunch.jpg');

  await t.test('1. Successful AI Response & Multiple Food Items Identification', async () => {
    MockFoodVisionProvider.reset();

    const res = await server.inject({
      method: 'POST',
      url: `/api/v1/food-logs/uploads/${primaryUploadId}/analyze`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { userNotes: 'Post-workout lunch bowl' },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.equal(body.success, true);
    assert.equal(body.data.uploadId, primaryUploadId);
    assert.equal(body.data.status, 'completed');

    // Structural validations
    const analysis = body.data.analysis;
    assert.ok(analysis, 'Normalized analysis must be present');
    assert.equal(analysis.dishName, 'Grilled Chicken Bowl with Brown Rice & Avocado');
    assert.equal(analysis.mealSlotSuggestion, 'lunch');
    assert.equal(analysis.isIdentifiedAsFood, true);

    // Verify multiple identified items
    assert.ok(analysis.items.length >= 4, 'Must identify multiple food items');
    const chicken = analysis.items.find((i: any) => i.name.includes('Chicken'));
    assert.ok(chicken);
    assert.equal(chicken.calories, 265);
    assert.equal(chicken.proteinG, 49.5);
    assert.equal(chicken.confidence, 'high');

    // Verify macronutrient totals
    assert.equal(analysis.totals.totalCalories, 634);
    assert.equal(analysis.totals.totalProteinG, 58.1);
    assert.equal(analysis.totals.totalCarbsG, 58.2);
    assert.equal(analysis.totals.totalFatG, 18.7);

    // Verify uncertainty caveats
    assert.equal(analysis.uncertainty.overallConfidence, 'high');
    assert.ok(analysis.uncertainty.confidenceScore >= 0.8);
    assert.ok(analysis.uncertainty.uncertainties.length > 0, 'Must include explicit caveats');

    // VERIFY DATABASE SEPARATION: Raw vs Normalized stored separately in DB
    const [dbRow] = await db.select().from(aiAnalyses).where(eq(aiAnalyses.id, body.data.id));
    assert.ok(dbRow);
    assert.ok(dbRow.rawResponsePayload, 'raw_response_payload must be preserved');
    assert.ok(dbRow.normalizedData, 'normalized_data must be populated');
    assert.equal((dbRow.normalizedData as any).totals.totalCalories, 634);

    // VERIFY CALORIE INTEGRITY: Analysis does NOT modify user daily calorie totals
    const dashRes = await server.inject({
      method: 'GET',
      url: '/api/v1/users/dashboard',
      headers: { authorization: `Bearer ${tokenA}` },
    });
    const dashBody = JSON.parse(dashRes.payload);
    assert.equal(
      dashBody.data.todaySummary.consumedCalories,
      0,
      'AI Analysis must NOT modify consumed calories before user confirmation'
    );
    assert.equal(dashBody.data.todaySummary.mealsLoggedCount, 0);
  });

  await t.test('2. Duplicate Analysis Prevention (Idempotent Cached Return)', async () => {
    // Calling analyze again without forceReanalyze must return existing analysis immediately
    const res = await server.inject({
      method: 'POST',
      url: `/api/v1/food-logs/uploads/${primaryUploadId}/analyze`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { forceReanalyze: false },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.equal(body.data.uploadId, primaryUploadId);
    assert.equal(body.data.status, 'completed');
    assert.equal(body.data.analysis.totals.totalCalories, 634);
  });

  await t.test('3. Retry Analysis (Forces Re-analysis Execution)', async () => {
    const res = await server.inject({
      method: 'POST',
      url: `/api/v1/food-logs/uploads/${primaryUploadId}/retry-analysis`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: { userNotes: 'Updated context notes' },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.equal(body.data.status, 'completed');
  });

  await t.test('4. Invalid AI Response Handling (Schema Violation / Malformed Data)', async () => {
    const invalidUploadId = await uploadImageForUser('corrupted.jpg');

    // Simulate provider returning negative calories / invalid schema
    MockFoodVisionProvider.setMockScenario({ returnInvalidSchema: true });

    const res = await server.inject({
      method: 'POST',
      url: `/api/v1/food-logs/uploads/${invalidUploadId}/analyze`,
      headers: { authorization: `Bearer ${tokenA}` },
    });

    assert.equal(res.statusCode, 422);
    const body = JSON.parse(res.payload);
    assert.equal(body.success, false);
    assert.equal(body.error.code, 'INVALID_AI_SCHEMA');

    // Check DB: Recorded as failed, raw response preserved for diagnosis
    const [dbRow] = await db.select().from(aiAnalyses).where(eq(aiAnalyses.uploadId, invalidUploadId));
    assert.ok(dbRow);
    assert.equal(dbRow.status, 'failed');
    assert.ok(dbRow.errorMessage);
    assert.ok(dbRow.rawResponsePayload, 'Raw diagnostic payload must be preserved on failure');
    assert.equal(dbRow.normalizedData, null);

    // Reset mock
    MockFoodVisionProvider.reset();
  });

  await t.test('5. Missing Food Items / Non-Food Object Handling', async () => {
    const nonFoodUploadId = await uploadImageForUser('random-desk.jpg');
    MockFoodVisionProvider.setMockScenario({ returnEmptyItems: true });

    const res = await server.inject({
      method: 'POST',
      url: `/api/v1/food-logs/uploads/${nonFoodUploadId}/analyze`,
      headers: { authorization: `Bearer ${tokenA}` },
    });

    // Empty items fails schema requirement of min(1) items and is marked as failed/schema error
    assert.equal(res.statusCode, 422);
    const body = JSON.parse(res.payload);
    assert.equal(body.error.code, 'INVALID_AI_SCHEMA');

    MockFoodVisionProvider.reset();
  });

  await t.test('6. Low-Confidence Analysis (Transitions to needs_review State)', async () => {
    const ambiguousUploadId = await uploadImageForUser('soup.jpg');
    MockFoodVisionProvider.setMockScenario({ returnLowConfidence: true });

    const res = await server.inject({
      method: 'POST',
      url: `/api/v1/food-logs/uploads/${ambiguousUploadId}/analyze`,
      headers: { authorization: `Bearer ${tokenA}` },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.equal(body.data.status, 'needs_review', 'Ambiguous low-confidence meal must transition to needs_review');
    assert.equal(body.data.analysis.uncertainty.overallConfidence, 'low');
    assert.ok(body.data.analysis.uncertainty.hasHiddenIngredients);
    assert.ok(body.data.analysis.uncertainty.uncertainties.length > 0);

    MockFoodVisionProvider.reset();
  });

  await t.test('7. AI Timeout Handling', async () => {
    const timeoutUploadId = await uploadImageForUser('slow.jpg');
    MockFoodVisionProvider.setMockScenario({ shouldTimeout: true, timeoutMs: 50 });

    const res = await server.inject({
      method: 'POST',
      url: `/api/v1/food-logs/uploads/${timeoutUploadId}/analyze`,
      headers: { authorization: `Bearer ${tokenA}` },
    });

    assert.equal(res.statusCode, 504);
    const body = JSON.parse(res.payload);
    assert.equal(body.error.code, 'AI_TIMEOUT');

    MockFoodVisionProvider.reset();
  });

  await t.test('8. Upstream Provider Failure (502 Gateway Error)', async () => {
    const failureUploadId = await uploadImageForUser('provider-fail.jpg');
    MockFoodVisionProvider.setMockScenario({
      shouldFail: true,
      failureMessage: 'Upstream Gemini 503 high load service unavailable',
    });

    const res = await server.inject({
      method: 'POST',
      url: `/api/v1/food-logs/uploads/${failureUploadId}/analyze`,
      headers: { authorization: `Bearer ${tokenA}` },
    });

    assert.equal(res.statusCode, 502);
    const body = JSON.parse(res.payload);
    assert.equal(body.error.code, 'AI_PROVIDER_ERROR');

    MockFoodVisionProvider.reset();
  });

  await t.test('9. Unauthorized Request (Tenant Isolation)', async () => {
    // User Beta attempts to analyze User Alpha's upload
    const res = await server.inject({
      method: 'POST',
      url: `/api/v1/food-logs/uploads/${primaryUploadId}/analyze`,
      headers: { authorization: `Bearer ${tokenB}` },
    });
    assert.equal(res.statusCode, 404, 'Must return 404 Not Found / Access Denied');

    // User Beta attempts to read User Alpha's analysis
    const getRes = await server.inject({
      method: 'GET',
      url: `/api/v1/food-logs/uploads/${primaryUploadId}/analysis`,
      headers: { authorization: `Bearer ${tokenB}` },
    });
    assert.equal(getRes.statusCode, 404);
  });

  await t.test('10. Calorie Aggregation Safety Verification', async () => {
    // Confirm that across all previous upload and analysis tests, User Alpha calories consumed is still 0
    const dashRes = await server.inject({
      method: 'GET',
      url: '/api/v1/users/dashboard',
      headers: { authorization: `Bearer ${tokenA}` },
    });
    const dash = JSON.parse(dashRes.payload).data;
    assert.equal(dash.todaySummary.consumedCalories, 0);
    assert.equal(dash.todaySummary.mealsLoggedCount, 0);
  });
});
