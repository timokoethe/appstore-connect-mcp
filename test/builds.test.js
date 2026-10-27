import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { test } from 'node:test';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { AppleClientError, createAppleClient } from '../build/apple/client.js';
import { createServer } from '../build/server.js';
import { createListBuilds } from '../build/tools/list-builds.js';
import { createListApps } from '../build/tools/apps.js';
import { ToolError } from '../build/tools/shared.js';
import { rpc } from './helpers/rpc.js';

const attributes = {
  version: '42', uploadedDate: '2026-10-01T12:00:00Z', processingState: 'VALID',
  expirationDate: '2026-12-30T12:00:00Z', expired: false,
};
const build = (id = 'b1', versionId = 'pr1', attrs = attributes) => ({
  id, type: 'builds', attributes: { ...attrs, iconAssetToken: 'synthetic-secret' },
  relationships: { preReleaseVersion: { data: versionId === null ? null : { type: 'preReleaseVersions', id: versionId } } },
});
const version = (id = 'pr1', marketingVersion = '1.0', platform = 'IOS') => ({
  id, type: 'preReleaseVersions', attributes: { version: marketingVersion, platform, secret: 'synthetic-secret' },
});
const page = (data = [build()], included = [version()], next = null) => ({ data, included, links: { next } });
const expected = {
  id: 'b1', buildNumber: '42', uploadedDate: attributes.uploadedDate, processingState: 'VALID',
  expirationDate: attributes.expirationDate, expired: false, preReleaseVersionId: 'pr1',
  marketingVersion: '1.0', platform: 'IOS', contextUnavailable: false,
};
const code = (expectedCode) => (error) => {
  assert.ok(error instanceof ToolError || error instanceof AppleClientError);
  assert.equal(error.code, expectedCode);
  assert.equal(error.cause, undefined);
  assert.ok(!error.message.includes('synthetic-secret'));
  return true;
};

test('list_builds uses one sparse GET with app filter, include and newest-upload sort', async () => {
  let calls = 0;
  const client = createAppleClient({ getToken: () => 'synthetic-token' }, { fetch: async (url, options) => {
    calls++;
    assert.equal(url.origin, 'https://api.appstoreconnect.apple.com');
    assert.equal(url.pathname, '/v1/builds');
    assert.equal(options.method, 'GET');
    assert.deepEqual(Object.fromEntries(url.searchParams), {
      'filter[app]': 'app1',
      'fields[builds]': 'version,uploadedDate,processingState,expirationDate,expired,preReleaseVersion',
      include: 'preReleaseVersion', 'fields[preReleaseVersions]': 'version,platform',
      sort: '-uploadedDate', limit: '20',
    });
    return Response.json(page());
  } });
  assert.deepEqual(await createListBuilds(client)({ appId: 'app1' }), { items: [expected], nextCursor: null });
  assert.equal(calls, 1);
});

test('list_builds joins by prerelease ID, retaining repeated build numbers across versions and platforms', async () => {
  const list = createListBuilds({ async get() {
    return page([build('b1'), build('b2', 'pr2'), build('b3', 'pr3'), build('b4')],
      [version('pr3', '1.0', 'MAC_OS'), version('pr2', '2.0'), version()]);
  } });
  const { items } = await list({ appId: 'app1' });
  assert.deepEqual(items.map(({ id, buildNumber, marketingVersion, platform }) =>
    [id, buildNumber, marketingVersion, platform]), [
    ['b1', '42', '1.0', 'IOS'], ['b2', '42', '2.0', 'IOS'],
    ['b3', '42', '1.0', 'MAC_OS'], ['b4', '42', '1.0', 'IOS'],
  ]);
});

test('list_builds reports missing context without guessing or issuing follow-up requests', async () => {
  for (const raw of [
    { data: [build()], links: {} },
    page([build()], []),
    page([build()], [version('unrelated')]),
    page([build()], [{ id: 'pr1', type: 'apps', attributes: { version: 'wrong', platform: 'wrong' } }]),
    page([build('b1', null)]),
    page([{ ...build(), relationships: {} }]),
    page([{ ...build(), relationships: { preReleaseVersion: { links: { related: 'https://example.invalid' } } } }]),
    page([{ id: 'b1', type: 'builds', attributes }]),
  ]) {
    let calls = 0;
    const result = await createListBuilds({ async get() { calls++; return raw; } })({ appId: 'app1' });
    assert.deepEqual(result.items[0], {
      ...expected, preReleaseVersionId: raw.data[0].relationships?.preReleaseVersion?.data?.id ?? null,
      marketingVersion: null, platform: null, contextUnavailable: true,
    });
    assert.equal(calls, 1);
  }
});

test('list_builds preserves nullable attributes, partial context and unknown Apple enum values', async () => {
  const nullable = Object.fromEntries(Object.keys(attributes).map((key) => [key, null]));
  const list = createListBuilds({ async get() {
    return page([build('b1', 'pr1', nullable), build('b2', 'pr2', { ...attributes, processingState: 'FUTURE_STATE', expired: true })],
      [version('pr1', null, 'FUTURE_PLATFORM'), version('pr2', '2.0', null)]);
  } });
  assert.deepEqual((await list({ appId: 'app1' })).items, [
    { ...expected, buildNumber: null, uploadedDate: null, processingState: null, expirationDate: null,
      expired: null, marketingVersion: null, platform: 'FUTURE_PLATFORM', contextUnavailable: true },
    { ...expected, id: 'b2', preReleaseVersionId: 'pr2', processingState: 'FUTURE_STATE', expired: true,
      marketingVersion: '2.0', platform: null, contextUnavailable: true },
  ]);
  assert.deepEqual(await createListBuilds({ async get() { return page([], []); } })({ appId: 'app1' }),
    { items: [], nextCursor: null });
});

test('list_builds validates arguments before access', async () => {
  const list = createListBuilds({ async get() { assert.fail('must not request'); } });
  for (const args of [null, {}, { appId: '../synthetic-secret' }, { appId: 'a?b' }, { appId: 1 },
    { appId: 'a'.repeat(256) }, { appId: 'app1', platform: 'IOS' }, { appId: 'app1', limit: 0 },
    { appId: 'app1', limit: 101 }, { appId: 'app1', limit: 1.5 }, { appId: 'app1', limit: '1' },
    { appId: 'app1', cursor: 'https://example.invalid' },
  ]) await assert.rejects(list(args), code('invalid_input'));
});

test('list_builds rejects malformed attributes, linkage, included versions and oversized pages', async () => {
  for (const raw of [{}, page([{ ...build(), type: 'apps' }]), page([{ ...build(), id: '../b1' }]),
    page([build('b1', 'pr1', {})]), page([build('b1', 'pr1', { ...attributes, expired: 'false' })]),
    page([build('b1', 'pr1', { ...attributes, version: 42 })]),
    page([{ ...build(), relationships: null }]),
    page([{ ...build(), relationships: { preReleaseVersion: null } }]),
    page([{ ...build(), relationships: { preReleaseVersion: { data: { type: 'apps', id: 'pr1' } } } }]),
    page([{ ...build(), relationships: { preReleaseVersion: { data: { type: 'preReleaseVersions', id: '../pr1' } } } }]),
    page([{ ...build(), relationships: { preReleaseVersion: { data: [] } } }]),
    page([build()], [{ ...version(), attributes: {} }]),
    page([build()], [version('pr1', 1)]), page([build()], [version(), version()]),
    page([build()], null), page([build(), build('b2')]),
    page(Array.from({ length: 101 }, (_, i) => build(`b${i}`))),
  ]) await assert.rejects(createListBuilds({ async get() { return raw; } })({ appId: 'app1', limit: 1 }), code('upstream'));
});

test('list_builds binds cursor to app, tool, connection and expiry', async () => {
  let now = 0;
  let calls = 0;
  const client = { async get() { calls++; return page([build()], [version()], '/v1/builds?cursor=second'); } };
  const list = createListBuilds(client, { now: () => now });
  const { nextCursor: cursor } = await list({ appId: 'app1' });
  for (const invoke of [() => list({ appId: 'app2', cursor }),
    () => createListBuilds(client)({ appId: 'app1', cursor }),
    () => createListApps(client)({ cursor }),
  ]) await assert.rejects(invoke(), code('invalid_cursor'));
  now = 600_000;
  await assert.rejects(list({ appId: 'app1', cursor }), code('invalid_cursor'));
  assert.equal(calls, 1);
});

test('list_builds retains filters, includes and version context across pages and smaller buffered retries', async () => {
  let calls = 0;
  const list = createListBuilds({ async get(path, query) {
    calls++;
    assert.equal(path, '/v1/builds');
    assert.equal(query['filter[app]'], 'app1');
    assert.equal(query.include, 'preReleaseVersion');
    assert.equal(query['fields[preReleaseVersions]'], 'version,platform');
    assert.equal(query.sort, '-uploadedDate');
    assert.equal(query.limit, '2');
    return query.cursor
      ? page([build('b2', 'pr2'), build('b3', 'pr2')], [version('pr2', '2.0', 'MAC_OS')])
      : page([build()], [version()], '/v1/builds?cursor=second');
  } }, { maxOutputBytes: Buffer.byteLength(JSON.stringify({ items: [expected], nextCursor: 'x'.repeat(32) })) + 20 });
  const first = await list({ appId: 'app1', limit: 2 });
  await assert.rejects(list({ appId: 'app1', limit: 2, cursor: first.nextCursor }), code('output_too_large'));
  const second = await list({ appId: 'app1', limit: 1, cursor: first.nextCursor });
  const third = await list({ appId: 'app1', limit: 1, cursor: second.nextCursor });
  assert.deepEqual([...first.items, ...second.items, ...third.items].map(({ id }) => id), ['b1', 'b2', 'b3']);
  assert.equal(second.items[0].marketingVersion, '2.0');
  assert.equal(third.items[0].platform, 'MAC_OS');
  assert.equal(third.nextCursor, null);
  assert.equal(calls, 2);
});

test('list_builds rejects next links that change app, include, fields, sort, path or origin', async () => {
  for (const next of ['https://example.invalid/v1/builds?cursor=x', '/v1/apps?cursor=x',
    '/v1/builds?cursor=x&filter%5Bapp%5D=app2', '/v1/builds?cursor=x&include=app',
    '/v1/builds?cursor=x&fields%5BpreReleaseVersions%5D=version', '/v1/builds?cursor=x&sort=version',
    '/v1/builds?cursor=x&limit=99', '/v1/builds?cursor=x&cursor=y', '/v1/builds?cursor=x#secret',
  ]) {
    let calls = 0;
    const list = createListBuilds({ async get() { calls++; return page([], [], next); } });
    await assert.rejects(list({ appId: 'app1' }), code('upstream'));
    assert.equal(calls, 1);
  }
});

test('list_builds enforces UTF-8 output limits on included context without truncation', async () => {
  const list = createListBuilds({ async get() { return page([build()], [version('pr1', 'é'.repeat(17_000))]); } });
  await assert.rejects(list({ appId: 'app1' }), code('record_too_large'));
});

test('list_builds preserves safe transport errors', async () => {
  for (const [status, expectedCode] of [[401, 'authentication'], [403, 'access_denied'], [404, 'not_found'],
    [429, 'rate_limited'], [503, 'upstream']]) {
    const client = createAppleClient({ getToken: () => 'synthetic-token' }, {
      fetch: async () => new Response('synthetic-secret', { status }), wait: async () => {},
    });
    await assert.rejects(createListBuilds(client)({ appId: 'app1' }), code(expectedCode));
  }
});

test('list_builds discovery, pagination and safe failures work over MCP stdio', async (t) => {
  let calls = 0;
  const server = createServer({ async get(path, query) {
    calls++;
    assert.equal(path, '/v1/builds');
    if (query['filter[app]'] === 'missing') throw new AppleClientError('not_found');
    if (query['filter[app]'] === 'failure') throw new Error('synthetic-secret');
    return query.cursor ? page([build('b2')]) : page([build()], [version()], '/v1/builds?cursor=second');
  } });
  const input = new PassThrough();
  const output = new PassThrough();
  const client = rpc(input, output);
  await server.connect(new StdioServerTransport(input, output));
  t.after(async () => { client.close(); await server.close(); });
  await client.initialize();
  const { tools } = await client.request('tools/list');
  const tool = tools.find(({ name }) => name === 'list_builds');
  assert.deepEqual(tool.inputSchema.required, ['appId']);
  assert.equal(tool.inputSchema.additionalProperties, false);
  assert.deepEqual(tool.annotations, { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true });
  const first = await client.request('tools/call', { name: 'list_builds', arguments: { appId: 'app1', limit: 1 } });
  assert.deepEqual(first.structuredContent.items, [expected]);
  const second = await client.request('tools/call', {
    name: 'list_builds', arguments: { appId: 'app1', limit: 1, cursor: first.structuredContent.nextCursor },
  });
  assert.deepEqual(second.structuredContent, { items: [{ ...expected, id: 'b2' }], nextCursor: null });
  for (const result of [first, second]) {
    assert.deepEqual(JSON.parse(result.content[0].text), result.structuredContent);
    assert.ok(!JSON.stringify(result).includes('synthetic-secret'));
  }
  for (const [args, expectedCode] of [[{}, 'invalid_input'], [{ appId: '../synthetic-secret' }, 'invalid_input'],
    [{ appId: 'app1', 'synthetic-secret': true }, 'invalid_input'],
    [{ appId: 'missing' }, 'not_found'], [{ appId: 'failure' }, 'upstream']]) {
    const failure = await client.request('tools/call', { name: 'list_builds', arguments: args });
    assert.equal(failure.isError, true);
    assert.equal(JSON.parse(failure.content[0].text).error.code, expectedCode);
    assert.equal(failure.structuredContent, undefined);
    assert.ok(!JSON.stringify(failure).includes('synthetic-secret'));
  }
  assert.equal(calls, 4);
  assert.equal(client.protocolError, false);
});
