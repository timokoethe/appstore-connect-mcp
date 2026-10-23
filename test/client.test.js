import assert from 'node:assert/strict';
import { inspect } from 'node:util';
import { test } from 'node:test';
import { AppleClientError, createAppleClient } from '../build/apple/client.js';

const secret = 'synthetic-secret-token';
const tokens = { getToken: () => secret };

function safeError(code) {
  return (error) => {
    assert.ok(error instanceof AppleClientError);
    assert.equal(error.code, code);
    assert.equal(error.cause, undefined);
    assert.ok(!inspect(error).includes(secret));
    return true;
  };
}

test('sends an authenticated GET with encoded query values and returns internal JSON', async () => {
  let calls = 0;
  const data = { data: [{ id: '123', attributes: { name: 'Synthetic App' } }] };
  const client = createAppleClient(tokens, { fetch: async (url, options) => {
    calls++;
    assert.equal(url.origin, 'https://api.appstoreconnect.apple.com');
    assert.equal(url.pathname, '/v1/apps');
    assert.equal(url.searchParams.get('filter[bundleId]'), 'com.example.app&limit=999');
    assert.equal(url.searchParams.get('limit'), '20');
    assert.equal(options.method, 'GET');
    assert.equal(options.body, undefined);
    assert.deepEqual(options.headers, { Authorization: `Bearer ${secret}`, Accept: 'application/json' });
    assert.equal(options.redirect, 'manual');
    assert.ok(options.signal instanceof AbortSignal);
    return Response.json(data);
  } });
  assert.deepEqual(await client.get('/v1/apps', { 'filter[bundleId]': 'com.example.app&limit=999', limit: '20' }), data);
  assert.equal(calls, 1);
  assert.deepEqual(Object.keys(client), ['get']);
});

test('rejects unsafe paths and malformed queries before authentication or network access', async () => {
  const client = createAppleClient({ getToken() { assert.fail('must not authenticate'); } }, {
    fetch: async () => assert.fail('must not fetch'),
  });
  for (const path of [undefined, '', 'https://evil.example/v1/apps', '//evil.example/v1/apps',
    '/v1/../apps', '/v1/apps/..', '/v1/%2e%2e/apps', '/v1/apps%2f123', '/v1/apps\\123',
    '/v1/apps?limit=1', '/v1/apps#fragment', '/v1/apps\n', '/v1//apps']) {
    await assert.rejects(client.get(path), safeError('invalid_input'));
  }
  for (const query of [null, [], 'limit=1', { limit: 1 }, { method: 'POST', body: {} }]) {
    await assert.rejects(client.get('/v1/apps', query), safeError('invalid_input'));
  }
});

test('validates timeout configuration', () => {
  for (const timeoutMs of [0, -1, 1.5, NaN, Infinity, 2_147_483_648]) {
    assert.throws(() => createAppleClient(tokens, { timeoutMs }), safeError('invalid_input'));
  }
});

test('sanitizes token-provider failures without issuing a request', async () => {
  const client = createAppleClient({ getToken() { throw new Error(secret); } }, {
    fetch: async () => assert.fail('must not fetch'),
  });
  await assert.rejects(client.get('/v1/apps'), safeError('authentication'));
});

for (const [status, code] of [[400, 'upstream'], [401, 'authentication'], [403, 'access_denied'],
  [404, 'not_found'], [429, 'rate_limited'], [500, 'upstream'], [503, 'upstream'],
  [301, 'upstream'], [302, 'upstream'], [307, 'upstream'], [308, 'upstream']]) {
  test(`sanitizes HTTP ${status}, cancels its body and does not retry or follow redirects`, async () => {
    let calls = 0;
    let cancelled = false;
    const client = createAppleClient(tokens, { fetch: async () => {
      calls++;
      return new Response(new ReadableStream({
        start(controller) { controller.enqueue(new TextEncoder().encode(secret)); },
        cancel() { cancelled = true; },
      }), { status, headers: { Location: `https://evil.example/${secret}` } });
    } });
    await assert.rejects(client.get('/v1/apps'), safeError(code));
    assert.equal(calls, 1);
    assert.equal(cancelled, true);
  });
}

test('sanitizes network failures and malformed JSON', async () => {
  for (const fetch of [async () => { throw new Error(secret); }, async () => new Response(secret)]) {
    const client = createAppleClient(tokens, { fetch });
    await assert.rejects(client.get('/v1/apps'), safeError('upstream'));
  }
});

for (const phase of ['headers', 'body']) {
  test(`times out while waiting for ${phase}`, async () => {
    let signal;
    const client = createAppleClient(tokens, { timeoutMs: 10, fetch: async (_url, options) => {
      signal = options.signal;
      if (phase === 'headers') {
        return new Promise((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new Error(secret)), { once: true });
        });
      }
      return new Response(new ReadableStream({ start(controller) {
        signal.addEventListener('abort', () => controller.error(new Error(secret)), { once: true });
      } }));
    } });
    await assert.rejects(client.get('/v1/apps'), safeError('timeout'));
    assert.equal(signal.aborted, true);
  });
}

test('clears the timeout after success and obtains a fresh token on each call', async () => {
  let count = 0;
  const signals = [];
  const client = createAppleClient({ getToken: () => `token-${++count}` }, {
    timeoutMs: 10,
    fetch: async (_url, options) => {
      assert.equal(options.headers.Authorization, `Bearer token-${count}`);
      signals.push(options.signal);
      return Response.json({ data: [] });
    },
  });
  await client.get('/v1/apps');
  await client.get('/v2/example/id_123-related');
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(count, 2);
  assert.ok(signals.every((signal) => !signal.aborted));
});

test('validates response byte limit configuration', () => {
  for (const maxResponseBytes of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '100']) {
    assert.throws(() => createAppleClient(tokens, { maxResponseBytes }), safeError('invalid_input'));
  }
});

test('accepts JSON exactly at the byte limit, including split UTF-8 characters', async () => {
  const bytes = new TextEncoder().encode('{"name":"Ä🍎"}');
  const client = createAppleClient(tokens, {
    maxResponseBytes: bytes.length,
    fetch: async () => new Response(new ReadableStream({ start(controller) {
      for (const byte of bytes) controller.enqueue(Uint8Array.of(byte));
      controller.close();
    } })),
  });
  assert.deepEqual(await client.get('/v1/apps'), { name: 'Ä🍎' });
});

for (const contentLength of [undefined, '1', '999999']) {
  test(`counts actual bytes and cancels oversized responses (Content-Length: ${contentLength})`, async () => {
    let cancelled = false;
    let calls = 0;
    const client = createAppleClient(tokens, {
      maxResponseBytes: 4,
      fetch: async () => {
        calls++;
        return new Response(new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('null'));
            controller.enqueue(new TextEncoder().encode(' '));
          },
          cancel() { cancelled = true; },
        }), { headers: contentLength === undefined ? {} : { 'Content-Length': contentLength } });
      },
    });
    await assert.rejects(client.get('/v1/apps'), safeError('response_too_large'));
    assert.equal(cancelled, true);
    assert.equal(calls, 1);
  });
}

test('enforces the default one MiB limit and sanitizes cancellation failures', async () => {
  const client = createAppleClient(tokens, { fetch: async () => new Response(new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(1_048_577)); },
    cancel() { throw new Error(secret); },
  })) });
  await assert.rejects(client.get('/v1/apps'), safeError('response_too_large'));
});

test('sanitizes empty bodies and failures while reading a response', async () => {
  for (const fetch of [async () => new Response(null, { status: 204 }),
    async () => new Response(new ReadableStream({ start(controller) { controller.error(new Error(secret)); } }))]) {
    await assert.rejects(createAppleClient(tokens, { fetch }).get('/v1/apps'), safeError('upstream'));
  }
});
