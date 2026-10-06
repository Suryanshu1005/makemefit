import test from 'node:test';
import assert from 'node:assert/strict';
import { buildServer } from '../src/server';

test('Auth Lifecycle - Register, Login, and Me', async () => {
  const server = await buildServer();
  const uniqueEmail = `athlete_${Date.now()}@example.com`;
  const password = 'StrongPassword123!';
  const displayName = 'Test Athlete';

  // 1. Register new user
  const registerRes = await server.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: {
      email: uniqueEmail,
      password,
      displayName,
      timezone: 'America/New_York',
    },
  });

  assert.equal(registerRes.statusCode, 201);
  const registerJson = JSON.parse(registerRes.payload);
  assert.equal(registerJson.success, true);
  assert.equal(typeof registerJson.data.accessToken, 'string');
  assert.equal(registerJson.data.user.email, uniqueEmail);
  const token = registerJson.data.accessToken;

  // 2. Fetch authenticated profile via /api/v1/auth/me
  const meRes = await server.inject({
    method: 'GET',
    url: '/api/v1/auth/me',
    headers: {
      authorization: `Bearer ${token}`,
    },
  });

  assert.equal(meRes.statusCode, 200);
  const meJson = JSON.parse(meRes.payload);
  assert.equal(meJson.success, true);
  assert.equal(meJson.data.user.displayName, displayName);
  assert.equal(meJson.data.profile.targetCalories, 2000);
  assert.equal(meJson.data.gamification.currentStreak, 0);
  assert.equal(meJson.data.gamification.currentLevel, 1);

  // 3. Login with credentials
  const loginRes = await server.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: {
      email: uniqueEmail,
      password,
    },
  });

  assert.equal(loginRes.statusCode, 200);
  const loginJson = JSON.parse(loginRes.payload);
  assert.equal(loginJson.success, true);
  assert.equal(typeof loginJson.data.accessToken, 'string');

  // 4. Login with invalid password fails
  const invalidLoginRes = await server.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: {
      email: uniqueEmail,
      password: 'WrongPassword!',
    },
  });

  assert.equal(invalidLoginRes.statusCode, 401);
  const invalidJson = JSON.parse(invalidLoginRes.payload);
  assert.equal(invalidJson.success, false);
  assert.equal(invalidJson.error.code, 'UNAUTHORIZED');

  await server.close();
});
