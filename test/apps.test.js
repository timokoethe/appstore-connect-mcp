import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AppsError, createListApps } from '../build/tools/apps.js';
import { AppleClientError } from '../build/apple/client.js';

const app = (id, name = `App ${id}`) => ({ id, type: 'apps', attributes: {
  name, bundleId: 'com.example.app', sku: null, primaryLocale: 'en-US', secret: 'must-not-return',
}, relationships: { secret: 'must-not-return' } });
const page = (ids, next = null) => ({ data: ids.map((id) => app(id)), links: { next } });
const next = (cursor, limit = 3) => `https://api.appstoreconnect.apple.com/v1/apps?cursor=${cursor}&limit=${limit}`;
const code = (expected) => (error) => {
  assert.ok(error instanceof AppsError || error instanceof AppleClientError);
  assert.equal(error.code, expected);
  assert.equal(error.cause, undefined);
  assert.ok(!error.message.includes('must-not-return'));
  return true;
};

test('maps only allowed identity fields, preserves nulls, and sends exact filters', async () => {
  const list = createListApps({ async get(path, query) {
    assert.equal(path, '/v1/apps');
    assert.deepEqual(query, { 'fields[apps]': 'name,bundleId,sku,primaryLocale', limit: '20', 'filter[bundleId]': 'com.example.app' });
    return page(['1']);
  } });
  assert.deepEqual(await list({ bundleId: 'com.example.app' }), { items: [{
    id: '1', name: 'App 1', bundleId: 'com.example.app', sku: null, primaryLocale: 'en-US',
  }], nextCursor: null });
});

test('accepts empty pages and rejects invalid arguments before network access', async () => {
  let calls = 0;
  const list = createListApps({ async get() { calls++; return page([]); } });
  for (const input of [null, [], { extra: 'must-not-return' }, { limit: 0 }, { limit: 101 }, { limit: 1.5 },
    { limit: '2' }, { bundleId: '' }, { bundleId: 'a,b' }, { bundleId: 'a*' }, { cursor: 'https://evil.example' }]) {
    await assert.rejects(list(input), code('invalid_input'));
  }
  assert.equal(calls, 0);
  assert.deepEqual(await list({}), { items: [], nextCursor: null });
});

test('reduces cursor page size without skipping or duplicating records, preserving upstream limit', async () => {
  const queries = [];
  const list = createListApps({ async get(_path, query) {
    queries.push(query);
    if (!query.cursor) return page(['1', '2', '3'], next('second'));
    assert.equal(query.limit, '3');
    return query.cursor === 'second' ? page(['4', '5', '6'], next('third')) : page(['7']);
  } });
  const first = await list({ limit: 3 });
  const second = await list({ cursor: first.nextCursor, limit: 1 });
  const replay = await list({ cursor: first.nextCursor, limit: 2 });
  assert.deepEqual(replay.items.map((x) => x.id), ['4', '5']);
  const third = await list({ cursor: second.nextCursor, limit: 2 });
  const fourth = await list({ cursor: third.nextCursor, limit: 2 });
  assert.deepEqual([...first.items, ...second.items, ...third.items, ...fourth.items].map((x) => x.id), ['1', '2', '3', '4', '5', '6', '7']);
  assert.equal(fourth.nextCursor, null);
  assert.equal(queries.length, 3);
});

test('binds cursors to connection and filters, rejects tampering, expiry, and evicted cursors', async () => {
  let time = 0;
  let calls = 0;
  const client = { async get() { calls++; return page(['1'], next('second', 1)); } };
  const list = createListApps(client, { now: () => time });
  const first = await list({ limit: 1, bundleId: 'com.example.app' });
  for (const args of [{ cursor: first.nextCursor }, { cursor: first.nextCursor, bundleId: 'com.other.app' },
    { cursor: 'a'.repeat(32), bundleId: 'com.example.app' }]) await assert.rejects(list(args), code('invalid_cursor'));
  await assert.rejects(createListApps(client)({ cursor: first.nextCursor, bundleId: 'com.example.app' }), code('invalid_cursor'));
  assert.equal(calls, 1);
  time = 600_000;
  await assert.rejects(list({ cursor: first.nextCursor, bundleId: 'com.example.app' }), code('invalid_cursor'));
  const evicted = await list({ limit: 1 });
  for (let i = 0; i < 32; i++) await list({ limit: 1 });
  await assert.rejects(list({ cursor: evicted.nextCursor }), code('invalid_cursor'));
});

test('retries oversized output with the same buffered cursor and reports single oversized records', async () => {
  let calls = 0;
  const list = createListApps({ async get(_path, query) {
    calls++;
    return query.cursor ? { data: [app('2', 'x'.repeat(180)), app('3', 'x'.repeat(180))], links: {} }
      : page(['1'], next('second', 2));
  } }, { maxOutputBytes: 400 });
  const first = await list({ limit: 2 });
  await assert.rejects(list({ cursor: first.nextCursor, limit: 2 }), code('output_too_large'));
  const second = await list({ cursor: first.nextCursor, limit: 1 });
  const third = await list({ cursor: second.nextCursor, limit: 1 });
  assert.deepEqual([...second.items, ...third.items].map((x) => x.id), ['2', '3']);
  assert.equal(calls, 2);
  const large = createListApps({ async get() { return { data: [app('1', 'x'.repeat(500))], links: {} }; } }, { maxOutputBytes: 400 });
  await assert.rejects(large({ limit: 1 }), code('record_too_large'));
});

test('rejects unsafe or inconsistent continuation links before following them', async () => {
  for (const link of ['https://evil.example/v1/apps?cursor=x', 'http://api.appstoreconnect.apple.com/v1/apps?cursor=x',
    'https://user:pass@api.appstoreconnect.apple.com/v1/apps?cursor=x', '/v1/builds?cursor=x',
    '/v1/apps?cursor=x#secret', '/v1/apps?cursor=x&include=builds', '/v1/apps?cursor=x&cursor=y',
    '/v1/apps?cursor=x&limit=99', '/v1/apps?cursor=x&filter%5BbundleId%5D=other', '/v1/apps?limit=1']) {
    let calls = 0;
    const list = createListApps({ async get() { calls++; return page(['1'], link); } });
    await assert.rejects(list({ limit: 1 }), code('upstream'));
    assert.equal(calls, 1);
  }
});

test('rejects malformed app data without leaking it', async () => {
  for (const raw of [{}, { data: [], links: null }, { data: [app('')], links: {} },
    { data: [{ ...app('1'), type: 'builds' }], links: {} },
    { data: [{ id: '1', type: 'apps', attributes: { name: 'must-not-return' } }], links: {} }]) {
    await assert.rejects(createListApps({ async get() { return raw; } })({}), code('upstream'));
  }
});

test('shares concurrent cursor reads and allows retry after upstream failure', async () => {
  let calls = 0;
  const list = createListApps({ async get(_path, query) {
    calls++;
    if (!query.cursor) return page(['1'], next('second', 1));
    if (calls === 2) throw new AppleClientError('timeout');
    return page(['2']);
  } });
  const first = await list({ limit: 1 });
  await assert.rejects(list({ cursor: first.nextCursor }), code('timeout'));
  const results = await Promise.all([list({ cursor: first.nextCursor }), list({ cursor: first.nextCursor })]);
  assert.equal(calls, 3);
  assert.deepEqual(results[0], results[1]);
});

test('first-page output errors can be retried with a smaller limit', async () => {
  const list = createListApps({ async get(_path, query) {
    return { data: ['1', '2'].slice(0, Number(query.limit)).map((id) => app(id, 'x'.repeat(150))), links: {} };
  } }, { maxOutputBytes: 350 });
  await assert.rejects(list({ limit: 2 }), code('output_too_large'));
  assert.equal((await list({ limit: 1 })).items.length, 1);
});

test('rejects repeated continuation cursors and oversized upstream pages', async () => {
  const list = createListApps({ async get() { return page(['1'], next('same', 1)); } });
  const first = await list({ limit: 1 });
  await assert.rejects(list({ cursor: first.nextCursor }), code('upstream'));
  await assert.rejects(createListApps({ async get() { return page(['1', '2']); } })({ limit: 1 }), code('upstream'));
});

test('new slice cursors receive their own full lifetime', async () => {
  let time = 0;
  const list = createListApps({ async get(_path, query) {
    return query.cursor ? page(['2', '3']) : page(['1'], next('second', 2));
  } }, { now: () => time });
  const first = await list({ limit: 2 });
  time = 599_000;
  const second = await list({ cursor: first.nextCursor, limit: 1 });
  time = 601_000;
  const third = await list({ cursor: second.nextCursor, limit: 1 });
  assert.deepEqual(third.items.map((item) => item.id), ['3']);
});
