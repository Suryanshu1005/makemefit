import test from 'node:test';
import assert from 'node:assert/strict';
import { buildServer } from '../src/server';

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

// Minimal valid PNG header
const VALID_PNG_BUFFER = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
]);

test('Food Log Upload & Pipeline Initiation Integration Suite', async (t) => {
  const server = await buildServer();

  // Create two distinct users to verify tenant isolation
  const userAEmail = `food_user_a_${Date.now()}@example.com`;
  const userBEmail = `food_user_b_${Date.now()}@example.com`;
  const password = 'StrongPassword123!';

  // User A registration
  const regARes = await server.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: { email: userAEmail, password, displayName: 'User Alpha' },
  });
  assert.equal(regARes.statusCode, 201);
  const tokenA = JSON.parse(regARes.payload).data.accessToken;

  // User B registration
  const regBRes = await server.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: { email: userBEmail, password, displayName: 'User Beta' },
  });
  assert.equal(regBRes.statusCode, 201);
  const tokenB = JSON.parse(regBRes.payload).data.accessToken;

  let createdUploadId: string = '';

  await t.test('1. Rejects unauthenticated upload request', async () => {
    const { payload, contentType } = createMultipartPayload(
      'file',
      'salad.jpg',
      'image/jpeg',
      VALID_JPEG_BUFFER
    );
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/food-logs/upload',
      headers: { 'content-type': contentType },
      payload,
    });
    assert.equal(res.statusCode, 401);
  });

  await t.test('2. Successfully uploads valid JPEG food image', async () => {
    const { payload, contentType } = createMultipartPayload(
      'file',
      'grilled-salmon.jpg',
      'image/jpeg',
      VALID_JPEG_BUFFER
    );
    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/food-logs/upload',
      headers: {
        authorization: `Bearer ${tokenA}`,
        'content-type': contentType,
      },
      payload,
    });

    assert.equal(res.statusCode, 201);
    const body = JSON.parse(res.payload);
    assert.equal(body.success, true);
    assert.ok(body.data.id);
    assert.equal(body.data.originalFileName, 'grilled-salmon.jpg');
    assert.equal(body.data.mimeType, 'image/jpeg');
    assert.equal(body.data.fileSizeBytes, VALID_JPEG_BUFFER.length);
    assert.equal(body.data.processingStatus, 'uploaded');
    assert.equal(body.data.imageUrl, `/api/v1/food-logs/uploads/${body.data.id}/image`);

    createdUploadId = body.data.id;
  });

  await t.test('3. Successfully retrieves upload metadata for owner', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/api/v1/food-logs/uploads/${createdUploadId}`,
      headers: { authorization: `Bearer ${tokenA}` },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.equal(body.data.id, createdUploadId);
    assert.equal(body.data.processingStatus, 'uploaded');
  });

  await t.test('4. Successfully streams stored image buffer back to owner', async () => {
    const res = await server.inject({
      method: 'GET',
      url: `/api/v1/food-logs/uploads/${createdUploadId}/image`,
      headers: { authorization: `Bearer ${tokenA}` },
    });

    assert.equal(res.statusCode, 200);
    assert.equal(res.headers['content-type'], 'image/jpeg');
    assert.deepEqual(res.rawPayload, VALID_JPEG_BUFFER);
  });

  await t.test('5. Tenant Isolation: User B cannot access User A upload metadata or image', async () => {
    // User B attempts to read User A's upload
    const metaRes = await server.inject({
      method: 'GET',
      url: `/api/v1/food-logs/uploads/${createdUploadId}`,
      headers: { authorization: `Bearer ${tokenB}` },
    });
    assert.equal(metaRes.statusCode, 404, 'User B must receive 404 Not Found / Access Denied');

    // User B attempts to download User A's image
    const imgRes = await server.inject({
      method: 'GET',
      url: `/api/v1/food-logs/uploads/${createdUploadId}/image`,
      headers: { authorization: `Bearer ${tokenB}` },
    });
    assert.equal(imgRes.statusCode, 404, 'User B must not be able to stream User A image');
  });

  await t.test('6. Rejects spoofed / corrupted magic bytes (exe renamed to .jpg)', async () => {
    const maliciousBuffer = Buffer.from('MZ_WINDOWS_PE_EXECUTABLE_HEADER_SPOOFED_CONTENT');
    const { payload, contentType } = createMultipartPayload(
      'file',
      'malware.jpg',
      'image/jpeg',
      maliciousBuffer
    );

    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/food-logs/upload',
      headers: {
        authorization: `Bearer ${tokenA}`,
        'content-type': contentType,
      },
      payload,
    });

    assert.equal(res.statusCode, 400);
    const body = JSON.parse(res.payload);
    assert.equal(body.success, false);
    assert.match(body.error.message, /Corrupted or invalid image file content/i);
  });

  await t.test('7. Rejects unsupported MIME type (e.g. text/plain)', async () => {
    const textBuffer = Buffer.from('hello world text notes');
    const { payload, contentType } = createMultipartPayload(
      'file',
      'recipe.txt',
      'text/plain',
      textBuffer
    );

    const res = await server.inject({
      method: 'POST',
      url: '/api/v1/food-logs/upload',
      headers: {
        authorization: `Bearer ${tokenA}`,
        'content-type': contentType,
      },
      payload,
    });

    assert.equal(res.statusCode, 400);
    const body = JSON.parse(res.payload);
    assert.match(body.error.message, /Unsupported file type/i);
  });

  await t.test('8. Initiates analysis pipeline (status transitions to analyzing)', async () => {
    const res = await server.inject({
      method: 'POST',
      url: `/api/v1/food-logs/uploads/${createdUploadId}/initiate-analysis`,
      headers: { authorization: `Bearer ${tokenA}` },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.equal(body.success, true);
    assert.equal(body.data.id, createdUploadId);
    assert.equal(body.data.processingStatus, 'analyzing');

    // Confirm that fetching upload also reflects analyzing status
    const getRes = await server.inject({
      method: 'GET',
      url: `/api/v1/food-logs/uploads/${createdUploadId}`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    const getBody = JSON.parse(getRes.payload);
    assert.equal(getBody.data.processingStatus, 'analyzing');
  });
});
