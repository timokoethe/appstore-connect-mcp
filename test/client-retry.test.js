import assert from 'node:assert/strict';
import { inspect } from 'node:util';
import { test } from 'node:test';
import { AppleClientError, createAppleClient } from '../build/apple/client.js';

const secret = 'synthetic-retry-secret';
const tokens = { getToken: () => secret };
const now = () => Date.UTC(2026, 9, 23, 12);

function safeError(code) {
  return (error) => {
    assert.ok(error instanceof AppleClientError);
    assert.equal(error.code, code);
    assert.equal(error.cause, undefined);
    assert.ok(!inspect(error).includes(secret));
    return true;
  };
}

for (const status of [429, 502, 503, 504]) {
  test(`retries HTTP ${status} at most twice and cancels failed bodies`, async () => {
    let calls = 0;
    let cancellations = 0;
    const waits = [];
    const signals = [];
    const client = createAppleClient(tokens, {
      wait: async (ms) => { waits.push(ms); },
      fetch: async (_url, options) => {
        calls++;
        signals.push(options.signal);
        return new Response(new ReadableStream({
          start(controller) { controller.enqueue(new TextEncoder().encode(secret)); },
          cancel() { cancellations++; },
        }), { status });
      },
    });
    await assert.rejects(client.get('/v1/apps'), safeError(status === 429 ? 'rate_limited' : 'upstream'));
    assert.equal(calls, 3);
    assert.equal(cancellations, 3);
    assert.deepEqual(waits, [500, 1000]);
    assert.equal(new Set(signals).size, 3);
  });
}

test('retries network failures with fresh tokens and stops on success', async () => {
  let calls = 0;
  let tokenCalls = 0;
  const waits = [];
  const client = createAppleClient({ getToken: () => `token-${++tokenCalls}` }, {
    wait: async (ms) => { waits.push(ms); },
    fetch: async (url, options) => {
      calls++;
      assert.equal(String(url), 'https://api.appstoreconnect.apple.com/v1/apps?limit=20');
      assert.equal(options.method, 'GET');
      assert.equal(options.redirect, 'manual');
      assert.equal(options.headers.Authorization, `Bearer token-${calls}`);
      if (calls === 1) throw new TypeError(secret);
      return Response.json({ data: [] });
    },
  });
  assert.deepEqual(await client.get('/v1/apps', { limit: '20' }), { data: [] });
  assert.equal(calls, 2);
  assert.equal(tokenCalls, 2);
  assert.deepEqual(waits, [500]);
});

test('bounds persistent network failures, including response-stream failures', async () => {
  for (const bodyFailure of [false, true]) {
    let calls = 0;
    const waits = [];
    const client = createAppleClient(tokens, {
      wait: async (ms) => { waits.push(ms); },
      fetch: async () => {
        calls++;
        if (!bodyFailure) throw new TypeError(secret);
        return new Response(new ReadableStream({ start(controller) { controller.error(new TypeError(secret)); } }));
      },
    });
    await assert.rejects(client.get('/v1/apps'), safeError('upstream'));
    assert.equal(calls, 3);
    assert.deepEqual(waits, [500, 1000]);
  }
});

for (const [header, delay] of [
  ['2', 2000], ['0', 0], ['5', 5000],
  ['Fri, 23 Oct 2026 12:00:03 GMT', 3000],
  ['Fri, 23 Oct 2026 11:59:59 GMT', 0],
  ['Tuesday, 20-Oct-26 12:00:00 GMT', 0],
  ['Wednesday, 21-Oct-26 12:00:00 GMT', 0],
  ['Thursday, 22-Oct-26 12:00:00 GMT', 0],
  ['Fri Oct 23 12:00:03 2026', 3000],
  ['invalid', 500], ['-1', 500], ['1.5', 500],
  ['6', null], ['99999999999999999999999', null],
  ['Fri, 23 Oct 2026 12:00:06 GMT', null],
]) {
  test(`handles Retry-After ${header}`, async () => {
    let calls = 0;
    const waits = [];
    const client = createAppleClient(tokens, {
      now, wait: async (ms) => { waits.push(ms); },
      fetch: async () => ++calls === 1
        ? new Response(secret, { status: 429, headers: { 'Retry-After': header } })
        : Response.json({ data: [] }),
    });
    if (delay === null) {
      await assert.rejects(client.get('/v1/apps'), safeError('rate_limited'));
      assert.equal(calls, 1);
      assert.deepEqual(waits, []);
    } else {
      assert.deepEqual(await client.get('/v1/apps'), { data: [] });
      assert.equal(calls, 2);
      assert.deepEqual(waits, [delay]);
    }
  });
}

test('does not retry permanent HTTP, JSON or size failures', async () => {
  for (const [response, code] of [
    [new Response(secret, { status: 401 }), 'authentication'],
    [new Response(secret, { status: 403 }), 'access_denied'],
    [new Response(secret, { status: 404 }), 'not_found'],
    [new Response(secret, { status: 500 }), 'upstream'],
    [new Response(secret, { status: 302 }), 'upstream'],
    [new Response('!'), 'upstream'],
    [new Response(secret), 'response_too_large'],
  ]) {
    let calls = 0;
    const waits = [];
    const client = createAppleClient(tokens, {
      maxResponseBytes: 4,
      wait: async (ms) => { waits.push(ms); },
      fetch: async () => { calls++; return response; },
    });
    await assert.rejects(client.get('/v1/apps'), safeError(code));
    assert.equal(calls, 1);
    assert.deepEqual(waits, []);
  }
});

test('clears attempt timers before waiting and sanitizes wait failures', async () => {
  let signal;
  let abortedDuringWait;
  let calls = 0;
  const client = createAppleClient(tokens, {
    timeoutMs: 5,
    fetch: async (_url, options) => {
      calls++;
      signal = options.signal;
      return new Response(null, { status: 503 });
    },
    wait: async () => {
      await new Promise((resolve) => setTimeout(resolve, 15));
      abortedDuringWait = signal.aborted;
      throw new Error(secret);
    },
  });
  await assert.rejects(client.get('/v1/apps'), safeError('upstream'));
  assert.equal(calls, 1);
  assert.equal(abortedDuringWait, false);
});

test('does not retry timeouts', async () => {
  let calls = 0;
  const waits = [];
  const client = createAppleClient(tokens, {
    timeoutMs: 5, wait: async (ms) => { waits.push(ms); },
    fetch: async (_url, { signal }) => {
      calls++;
      return new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error(secret)), { once: true });
      });
    },
  });
  await assert.rejects(client.get('/v1/apps'), safeError('timeout'));
  assert.equal(calls, 1);
  assert.deepEqual(waits, []);
});
