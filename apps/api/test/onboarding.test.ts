import test from 'node:test';
import assert from 'node:assert/strict';
import { buildServer } from '../src/server';

test('Onboarding Flow - Verification and Calculation', async () => {
  const server = await buildServer();
  const uniqueEmail = `onboard_athlete_${Date.now()}@example.com`;
  const password = 'StrongPassword123!';
  const displayName = 'Onboarding Athlete';

  // 1. Register new user
  const registerRes = await server.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: {
      email: uniqueEmail,
      password,
      displayName,
    },
  });

  assert.equal(registerRes.statusCode, 201);
  const registerJson = JSON.parse(registerRes.payload);
  const token = registerJson.data.accessToken;

  // 2. Verify initial onboarding status is false
  const initialMeRes = await server.inject({
    method: 'GET',
    url: '/api/v1/auth/me',
    headers: { authorization: `Bearer ${token}` },
  });
  const initialMe = JSON.parse(initialMeRes.payload);
  assert.equal(initialMe.data.profile.isOnboarded, false);

  // 3. Test validation error (invalid height / weight out of range)
  const invalidRes = await server.inject({
    method: 'POST',
    url: '/api/v1/users/onboarding',
    headers: { authorization: `Bearer ${token}` },
    payload: {
      gender: 'male',
      birthDate: '1995-05-15',
      heightCm: 10, // impossible height
      weightKg: 75,
      activityLevel: 'moderate',
      goal: 'weight_loss',
    },
  });
  assert.equal(invalidRes.statusCode, 400);

  // 4. Submit valid onboarding data
  // Male, 25 years old (approx), 75kg, 180cm, moderate activity, weight_loss (-500)
  const validRes = await server.inject({
    method: 'POST',
    url: '/api/v1/users/onboarding',
    headers: { authorization: `Bearer ${token}` },
    payload: {
      gender: 'male',
      birthDate: '1998-05-15',
      heightCm: 180,
      weightKg: 75,
      activityLevel: 'moderate',
      goal: 'weight_loss',
      timezone: 'America/Chicago',
    },
  });

  assert.equal(validRes.statusCode, 200);
  const validJson = JSON.parse(validRes.payload);
  assert.equal(validJson.success, true);
  assert.equal(validJson.data.profile.isOnboarded, true);
  assert.equal(validJson.data.profile.heightCm, 180);
  assert.equal(validJson.data.profile.weightKg, 75);
  assert.equal(validJson.data.user.timezone, 'America/Chicago');

  // Verify Mifflin-St Jeor calculation:
  // Male: 10 * 75 + 6.25 * 180 - 5 * age + 5
  // BMR > 1600, Moderate TDEE > 2500, Deficit (-500) > 2000
  assert.ok(validJson.data.profile.targetCalories > 1800);
  assert.ok(validJson.data.profile.targetProteinG > 100);

  // 5. Verify /api/v1/auth/me now reflects completed onboarding
  const updatedMeRes = await server.inject({
    method: 'GET',
    url: '/api/v1/auth/me',
    headers: { authorization: `Bearer ${token}` },
  });
  const updatedMe = JSON.parse(updatedMeRes.payload);
  assert.equal(updatedMe.data.profile.isOnboarded, true);
  assert.equal(updatedMe.data.user.timezone, 'America/Chicago');

  await server.close();
});
