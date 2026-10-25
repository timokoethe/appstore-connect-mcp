import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAppleClient, AppleClientError } from '../build/apple/client.js';
import { createGetApp } from '../build/tools/get-app.js';
import { ToolError } from '../build/tools/shared.js';

const resource = (id = 'app_123-abc') => ({
  id, type: 'apps', attributes: {
    name: 'Synthetic App', bundleId: 'com.example.app', sku: null, primaryLocale: 'en-US',
    secret: 'must-not-return',
  },
  relationships: { secret: 'must-not-return' },
});
const safeCode = (expected) => (error) => {
  assert.ok(error instanceof ToolError || error instanceof AppleClientError);
  assert.equal(error.code, expected);
  assert.equal(error.cause, undefined);
  assert.ok(!error.message.includes('must-not-return'));
  return true;
};

test('get_app makes one authenticated GET and returns only shared identity fields', async () => {
  let calls = 0;
  const client = createAppleClient({ getToken: () => 'synthetic-token' }, { fetch: async (url, options) => {
    calls++;
    assert.equal(url.origin, 'https://api.appstoreconnect.apple.com');
    assert.equal(url.pathname, '/v1/apps/app_123-abc');
    assert.deepEqual([...url.searchParams], [['fields[apps]', 'name,bundleId,sku,primaryLocale']]);
    assert.equal(options.method, 'GET');
    assert.equal(options.headers.Authorization, 'Bearer synthetic-token');
    return Response.json({ data: resource(), included: [{ secret: 'must-not-return' }] });
  } });
  assert.deepEqual(await createGetApp(client)({ appId: 'app_123-abc' }), { item: {
    id: 'app_123-abc', name: 'Synthetic App', bundleId: 'com.example.app', sku: null, primaryLocale: 'en-US',
  } });
  assert.equal(calls, 1);
});

test('get_app rejects missing, unsafe, oversized IDs and unknown arguments before access', async () => {
  const getApp = createGetApp({ async get() { assert.fail('must not request'); } });
  for (const input of [undefined, null, [], {}, { appId: 123 },
    ...['', ' ', '123/456', '..', '%2f', '123?include=builds', '123#fragment', 'a\\b',
      'https://evil.example', '123\n', 'ä', 'a'.repeat(256)].map((appId) => ({ appId })),
    { appId: '123', include: 'must-not-return' }, { appId: '123', limit: 1 },
  ]) await assert.rejects(getApp(input), safeCode('invalid_input'));
});

test('get_app rejects missing, malformed, wrong-type and mismatched resources', async () => {
  for (const data of [null, [], {}, resource('other'), resource('../123'),
    { ...resource(), type: 'builds' },
    { id: 'app_123-abc', type: 'apps', attributes: { name: 'must-not-return' } },
    { ...resource(), attributes: { ...resource().attributes, name: 123 } },
  ]) {
    await assert.rejects(createGetApp({ async get() { return { data }; } })({ appId: 'app_123-abc' }), safeCode('upstream'));
  }
});

test('get_app preserves null attributes', async () => {
  const attributes = { name: null, bundleId: null, sku: null, primaryLocale: null };
  const result = await createGetApp({ async get() {
    return { data: { ...resource('123'), attributes } };
  } })({ appId: '123' });
  assert.deepEqual(result, { item: { id: '123', ...attributes } });
});

test('get_app enforces the UTF-8 output budget without truncation', async () => {
  const item = { id: '123', name: '', bundleId: null, sku: null, primaryLocale: null };
  const remaining = 32_768 - Buffer.byteLength(JSON.stringify({ item }));
  item.name = 'é'.repeat(Math.floor(remaining / 2)) + 'x'.repeat(remaining % 2);
  const getApp = createGetApp({ async get() {
    const { id, ...attributes } = item;
    return { data: { id, type: 'apps', attributes } };
  } });
  assert.deepEqual(await getApp({ appId: '123' }), { item });
  item.name += 'x';
  await assert.rejects(getApp({ appId: '123' }), safeCode('record_too_large'));
});

for (const [status, code] of [[401, 'authentication'], [403, 'access_denied'], [404, 'not_found']]) {
  test(`get_app preserves safe HTTP ${status} errors`, async () => {
    let calls = 0;
    const client = createAppleClient({ getToken: () => 'synthetic-token' }, { fetch: async () => {
      calls++;
      return new Response('must-not-return', { status });
    } });
    await assert.rejects(createGetApp(client)({ appId: '123' }), safeCode(code));
    assert.equal(calls, 1);
  });
}
