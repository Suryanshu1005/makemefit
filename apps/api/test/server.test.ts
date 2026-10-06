import test from 'node:test';
import assert from 'node:assert/strict';
import { buildServer } from '../src/server';

test('Fastify Server - Health Endpoint', async () => {
  const server = await buildServer();

  const response = await server.inject({
    method: 'GET',
    url: '/health',
  });

  assert.equal(response.statusCode, 200);
  const json = JSON.parse(response.payload);
  assert.equal(typeof json.status, 'string');
  assert.equal(typeof json.timestamp, 'string');

  await server.close();
});

test('Fastify Server - Validation Error Handling', async () => {
  const server = await buildServer();

  // Invalid registration payload (missing password and invalid email)
  const response = await server.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: {
      email: 'not-an-email',
      displayName: 'A',
    },
  });

  assert.equal(response.statusCode, 400);
  const json = JSON.parse(response.payload);
  assert.equal(json.success, false);
  assert.equal(json.error.code, 'VALIDATION_ERROR');

  await server.close();
});
