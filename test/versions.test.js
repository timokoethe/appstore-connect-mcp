import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createAppleClient, AppleClientError } from '../build/apple/client.js';
import { createListApps } from '../build/tools/apps.js';
import { createListAppVersions } from '../build/tools/list-app-versions.js';
import { createGetAppVersion } from '../build/tools/get-app-version.js';
import { ToolError } from '../build/tools/shared.js';

const fields = 'versionString,platform,appVersionState,releaseType,createdDate';
const version = (id, platform = 'IOS', state = 'PREPARE_FOR_SUBMISSION') => ({
  id, type: 'appStoreVersions', attributes: {
    versionString: '1.2', platform, appVersionState: state, releaseType: 'MANUAL',
    createdDate: '2026-10-25T10:00:00Z', secret: 'must-not-return',
  },
  relationships: { appStoreReviewDetail: { secret: 'must-not-return' } },
});
const detail = (build = { type: 'builds', id: 'build-1' }) => ({ data: {
  ...version('v1'),
  attributes: { ...version('v1').attributes, earliestReleaseDate: null },
  relationships: { build: { data: build }, appStoreReviewDetail: { secret: 'must-not-return' } },
}, included: [{ type: 'builds', id: 'build-1', attributes: { iconAssetToken: 'must-not-return' } }] });
const page = (data, next = null) => ({ data, links: { next } });
const next = '/v1/apps/app1/appStoreVersions?cursor=second';
const code = (expected) => (error) => {
  assert.ok(error instanceof ToolError || error instanceof AppleClientError);
  assert.equal(error.code, expected);
  assert.equal(error.cause, undefined);
  assert.ok(!error.message.includes('must-not-return'));
  return true;
};

test('lists versions across platforms without selecting latest or exposing extra fields', async () => {
  const list = createListAppVersions({ async get(path, query) {
    assert.equal(path, '/v1/apps/app1/appStoreVersions');
    assert.deepEqual(query, { 'fields[appStoreVersions]': fields, limit: '20' });
    return page([version('ios'), version('mac', 'MAC_OS', 'FUTURE_STATE')]);
  } });
  const result = await list({ appId: 'app1' });
  assert.deepEqual(result.items, [
    { id: 'ios', versionString: '1.2', platform: 'IOS', appVersionState: 'PREPARE_FOR_SUBMISSION', releaseType: 'MANUAL', createdDate: '2026-10-25T10:00:00Z' },
    { id: 'mac', versionString: '1.2', platform: 'MAC_OS', appVersionState: 'FUTURE_STATE', releaseType: 'MANUAL', createdDate: '2026-10-25T10:00:00Z' },
  ]);
  assert.equal(result.nextCursor, null);
});

test('filters each supported platform and accepts empty pages', async () => {
  for (const platform of ['IOS', 'MAC_OS', 'TV_OS', 'VISION_OS']) {
    const list = createListAppVersions({ async get(_path, query) {
      assert.equal(query['filter[platform]'], platform);
      return page([]);
    } });
    assert.deepEqual(await list({ appId: 'app1', platform }), { items: [], nextCursor: null });
  }
});

test('rejects invalid version tool arguments before network access', async () => {
  const client = { async get() { assert.fail('must not request'); } };
  const list = createListAppVersions(client);
  const get = createGetAppVersion(client);
  for (const input of [null, {}, { appId: '../app1' }, { appId: 'app1', platform: 'ios' },
    { appId: 'app1', platform: 'IOS,MAC_OS' }, { appId: 'app1', limit: 101 },
    { appId: 'app1', limit: 0 }, { appId: 'app1', limit: 1.5 }, { appId: 'app1', limit: '1' },
    { appId: 'app1', cursor: 'https://evil.example' }, { appId: 'app1', include: 'must-not-return' },
  ]) await assert.rejects(list(input), code('invalid_input'));
  for (const input of [null, {}, { versionId: 1 }, { versionId: '../v1' }, { versionId: 'v1?include=x' },
    { versionId: 'a'.repeat(256) }, { versionId: 'v1', include: 'must-not-return' },
  ]) await assert.rejects(get(input), code('invalid_input'));
});

test('binds version cursors to app, platform, tool and connection before fetching', async () => {
  let calls = 0;
  const client = { async get() { calls++; return page([version('v1')], next); } };
  const list = createListAppVersions(client);
  const { nextCursor: cursor } = await list({ appId: 'app1', platform: 'IOS' });
  for (const input of [{ appId: 'app2', platform: 'IOS' }, { appId: 'app1', platform: 'MAC_OS' }, { appId: 'app1' }]) {
    await assert.rejects(list({ ...input, cursor }), code('invalid_cursor'));
  }
  await assert.rejects(createListAppVersions(client)({ appId: 'app1', platform: 'IOS', cursor }), code('invalid_cursor'));
  await assert.rejects(createListApps(client)({ cursor }), code('invalid_cursor'));
  assert.equal(calls, 1);
});

test('version pagination preserves records and original upstream page size on smaller retries', async () => {
  let calls = 0;
  const list = createListAppVersions({ async get(_path, query) {
    calls++;
    assert.equal(query.limit, '3');
    assert.equal(query['filter[platform]'], 'IOS');
    return query.cursor ? page([version('v4'), version('v5'), version('v6')])
      : page([version('v1'), version('v2'), version('v3')], next);
  } });
  const first = await list({ appId: 'app1', platform: 'IOS', limit: 3 });
  const second = await list({ appId: 'app1', platform: 'IOS', limit: 1, cursor: first.nextCursor });
  const replay = await list({ appId: 'app1', platform: 'IOS', limit: 2, cursor: first.nextCursor });
  assert.deepEqual(replay.items.map((item) => item.id), ['v4', 'v5']);
  const third = await list({ appId: 'app1', platform: 'IOS', limit: 2, cursor: second.nextCursor });
  assert.deepEqual([...first.items, ...second.items, ...third.items].map((item) => item.id), ['v1', 'v2', 'v3', 'v4', 'v5', 'v6']);
  assert.equal(third.nextCursor, null);
  assert.equal(calls, 2);
});

test('rejects unsafe next links and changes to the app path or platform', async () => {
  for (const link of ['https://evil.example/v1/apps/app1/appStoreVersions?cursor=x',
    '/v1/apps/app2/appStoreVersions?cursor=x', '/v1/apps?cursor=x',
    `${next}&filter%5Bplatform%5D=MAC_OS`, `${next}&limit=99`, `${next}&include=build`,
    `${next}&cursor=third`, `${next}#secret`,
  ]) {
    let calls = 0;
    const list = createListAppVersions({ async get() { calls++; return page([version('v1')], link); } });
    await assert.rejects(list({ appId: 'app1', platform: 'IOS' }), code('upstream'));
    assert.equal(calls, 1);
  }
});

test('output-budget failures leave a version cursor replayable and single oversized records fail distinctly', async () => {
  let calls = 0;
  const list = createListAppVersions({ async get(_path, query) {
    calls++;
    return query.cursor ? page([version('v2'), version('v3')]) : page([version('v1')], next);
  } }, { maxOutputBytes: 300 });
  const first = await list({ appId: 'app1', limit: 2 });
  await assert.rejects(list({ appId: 'app1', limit: 2, cursor: first.nextCursor }), code('output_too_large'));
  const second = await list({ appId: 'app1', limit: 1, cursor: first.nextCursor });
  const third = await list({ appId: 'app1', limit: 1, cursor: second.nextCursor });
  assert.deepEqual([second.items[0].id, third.items[0].id], ['v2', 'v3']);
  assert.equal(calls, 2);
  await assert.rejects(createListAppVersions({ async get() { return page([version('v1')]); } },
    { maxOutputBytes: 50 })({ appId: 'app1', limit: 1 }), code('record_too_large'));
});

test('version pages reject malformed resources, missing fields, unexpected platforms and oversized pages', async () => {
  for (const raw of [{}, page([{ ...version('v1'), type: 'apps' }]), page([version('../v1')]),
    page([{ ...version('v1'), attributes: { versionString: 'must-not-return' } }]),
    page([version('v1', 'MAC_OS')]), page([version('v1'), version('v2')]),
  ]) await assert.rejects(createListAppVersions({ async get() { return raw; } })({ appId: 'app1', platform: 'IOS', limit: 1 }), code('upstream'));
});

test('nullable version fields and unknown states are preserved', async () => {
  const attributes = { versionString: null, platform: null, appVersionState: null, releaseType: null, createdDate: null };
  const list = createListAppVersions({ async get() { return page([{ ...version('v1'), attributes }]); } });
  assert.deepEqual((await list({ appId: 'app1' })).items, [{ id: 'v1', ...attributes }]);
});

test('get_app_version uses one GET with a sparse build include and returns selected build ID', async () => {
  let calls = 0;
  const client = createAppleClient({ getToken: () => 'synthetic-token' }, { fetch: async (url, options) => {
    calls++;
    assert.equal(url.origin, 'https://api.appstoreconnect.apple.com');
    assert.equal(url.pathname, '/v1/appStoreVersions/v1');
    assert.equal(options.method, 'GET');
    assert.deepEqual(Object.fromEntries(url.searchParams), {
      'fields[appStoreVersions]': `${fields},earliestReleaseDate,build`, include: 'build', 'fields[builds]': 'version',
    });
    return Response.json(detail());
  } });
  const result = await createGetAppVersion(client)({ versionId: 'v1' });
  assert.deepEqual(result, { item: {
    id: 'v1', versionString: '1.2', platform: 'IOS', appVersionState: 'PREPARE_FOR_SUBMISSION',
    releaseType: 'MANUAL', createdDate: '2026-10-25T10:00:00Z', earliestReleaseDate: null, buildId: 'build-1',
  } });
  assert.equal(calls, 1);
});

test('get_app_version distinguishes explicitly absent builds and preserves a scheduled date', async () => {
  const raw = detail(null);
  raw.data.attributes.earliestReleaseDate = '2026-11-01T12:00:00Z';
  raw.data.attributes.releaseType = 'SCHEDULED';
  raw.data.attributes.appVersionState = 'FUTURE_STATE';
  const { item } = await createGetAppVersion({ async get() { return raw; } })({ versionId: 'v1' });
  assert.equal(item.buildId, null);
  assert.equal(item.earliestReleaseDate, '2026-11-01T12:00:00Z');
  assert.equal(item.appVersionState, 'FUTURE_STATE');
});

test('get_app_version rejects mismatched IDs and missing or malformed build linkage', async () => {
  const missing = detail(); delete missing.data.relationships.build;
  const noData = detail(); noData.data.relationships.build = { links: { related: 'https://evil.example' } };
  const wrongId = detail(); wrongId.data.id = 'v2';
  const missingDate = detail(); delete missingDate.data.attributes.earliestReleaseDate;
  for (const raw of [missing, noData, wrongId, missingDate, detail({ type: 'apps', id: 'build-1' }),
    detail({ type: 'builds', id: '../build-1' }), { data: null },
  ]) await assert.rejects(createGetAppVersion({ async get() { return raw; } })({ versionId: 'v1' }), code('upstream'));
});

test('get_app_version enforces the output budget in UTF-8 bytes', async () => {
  const raw = detail(); raw.data.attributes.versionString = 'é'.repeat(17_000);
  await assert.rejects(createGetAppVersion({ async get() { return raw; } })({ versionId: 'v1' }), code('record_too_large'));
});

test('both version tools preserve safe transport errors', async () => {
  for (const [status, expected] of [[401, 'authentication'], [403, 'access_denied'], [404, 'not_found'], [429, 'rate_limited']]) {
    const client = createAppleClient({ getToken: () => 'synthetic-token' }, {
      fetch: async () => new Response('must-not-return', { status }), wait: async () => {},
    });
    await assert.rejects(createListAppVersions(client)({ appId: 'app1' }), code(expected));
    await assert.rejects(createGetAppVersion(client)({ versionId: 'v1' }), code(expected));
  }
});
