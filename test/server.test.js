import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { test } from 'node:test';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { createServer } from '../build/server.js';
import { AppleClientError } from '../build/apple/client.js';
import { rpc } from './helpers/rpc.js';

test('app-info tools discover and read localizations for an explicitly selected record over MCP', async (t) => {
  const calls = [];
  const server = createServer({ async get(path) {
    calls.push(path);
    if (path.includes('/missing/')) throw new AppleClientError('not_found');
    if (path.includes('/failure/')) throw new Error('synthetic-secret');
    if (path === '/v1/apps/app1/appInfos') return { data: [
      { id: 'live', type: 'appInfos', attributes: { state: 'READY_FOR_DISTRIBUTION' } },
      { id: 'draft', type: 'appInfos', attributes: { state: 'PREPARE_FOR_SUBMISSION', secret: 'synthetic-secret' } },
    ], links: {} };
    assert.equal(path, '/v1/appInfos/draft/appInfoLocalizations');
    return { data: [{ id: 'de', type: 'appInfoLocalizations', attributes: {
      locale: 'de-DE', name: 'Synthetic Draft', subtitle: null, privacyPolicyUrl: null, secret: 'synthetic-secret',
    } }], links: {} };
  } });
  const input = new PassThrough();
  const output = new PassThrough();
  const client = rpc(input, output);
  await server.connect(new StdioServerTransport(input, output));
  t.after(async () => { client.close(); await server.close(); });
  await client.initialize();
  const { tools } = await client.request('tools/list');
  for (const [name, key] of [['list_app_infos', 'appId'], ['list_app_info_localizations', 'appInfoId']]) {
    const tool = tools.find((tool) => tool.name === name);
    assert.deepEqual(tool.inputSchema.required, [key]);
    assert.equal(tool.inputSchema.additionalProperties, false);
    assert.deepEqual(tool.annotations, { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true });
    for (const [args, code] of [[{}, 'invalid_input'], [{ [key]: '../synthetic-secret' }, 'invalid_input'],
      [{ [key]: 'id', 'synthetic-secret': true }, 'invalid_input'],
      [{ [key]: 'missing' }, 'not_found'], [{ [key]: 'failure' }, 'upstream']]) {
      const failure = await client.request('tools/call', { name, arguments: args });
      assert.equal(failure.isError, true);
      assert.equal(JSON.parse(failure.content[0].text).error.code, code);
      assert.equal(failure.structuredContent, undefined);
      assert.ok(!JSON.stringify(failure).includes('synthetic-secret'));
    }
  }
  const infos = await client.request('tools/call', { name: 'list_app_infos', arguments: { appId: 'app1' } });
  assert.deepEqual(infos.structuredContent, { items: [
    { id: 'live', state: 'READY_FOR_DISTRIBUTION' }, { id: 'draft', state: 'PREPARE_FOR_SUBMISSION' },
  ], nextCursor: null });
  const localizations = await client.request('tools/call', {
    name: 'list_app_info_localizations', arguments: { appInfoId: infos.structuredContent.items[1].id },
  });
  assert.deepEqual(localizations.structuredContent, { items: [
    { id: 'de', locale: 'de-DE', name: 'Synthetic Draft', subtitle: null, privacyPolicyUrl: null },
  ], nextCursor: null });
  for (const result of [infos, localizations]) {
    assert.deepEqual(JSON.parse(result.content[0].text), result.structuredContent);
    assert.ok(!JSON.stringify(result).includes('synthetic-secret'));
  }
  assert.deepEqual(calls, ['/v1/apps/missing/appInfos', '/v1/apps/failure/appInfos',
    '/v1/appInfos/missing/appInfoLocalizations', '/v1/appInfos/failure/appInfoLocalizations',
    '/v1/apps/app1/appInfos', '/v1/appInfos/draft/appInfoLocalizations']);
  assert.equal(client.protocolError, false);
});

test('version tools discover, invoke and sanitize failures through MCP', async (t) => {
  const calls = [];
  const version = { id: 'v1', type: 'appStoreVersions', attributes: {
    versionString: '1.0', platform: 'IOS', appVersionState: 'FUTURE_STATE',
    releaseType: 'MANUAL', createdDate: null, earliestReleaseDate: null,
    demoAccountPassword: 'synthetic-secret',
  }, relationships: { build: { data: { id: 'b1', type: 'builds' } } } };
  const server = createServer({ async get(path) {
    calls.push(path);
    if (path.includes('missing')) throw new AppleClientError('not_found');
    if (path.includes('failure')) throw new Error('synthetic-secret');
    return path.endsWith('/appStoreVersions') ? { data: [version], links: {} } : { data: version };
  } });
  const input = new PassThrough();
  const output = new PassThrough();
  const client = rpc(input, output);
  await server.connect(new StdioServerTransport(input, output));
  t.after(async () => { client.close(); await server.close(); });
  await client.initialize();
  const { tools } = await client.request('tools/list');
  for (const [name, key, id] of [['list_app_versions', 'appId', 'app1'], ['get_app_version', 'versionId', 'v1']]) {
    const tool = tools.find((tool) => tool.name === name);
    assert.deepEqual(tool.inputSchema.required, [key]);
    assert.equal(tool.inputSchema.additionalProperties, false);
    assert.equal(tool.annotations.readOnlyHint, true);
    const result = await client.request('tools/call', { name, arguments: { [key]: id } });
    assert.deepEqual(JSON.parse(result.content[0].text), result.structuredContent);
    const item = name === 'list_app_versions' ? result.structuredContent.items[0] : result.structuredContent.item;
    assert.equal(item.appVersionState, 'FUTURE_STATE');
    if (name === 'get_app_version') assert.equal(item.buildId, 'b1');
    else assert.equal(result.structuredContent.nextCursor, null);
    assert.ok(!JSON.stringify(result).includes('synthetic-secret'));
    for (const [args, code] of [[{}, 'invalid_input'], [{ [key]: '../synthetic-secret' }, 'invalid_input'],
      [{ [key]: 'missing' }, 'not_found'], [{ [key]: 'failure' }, 'upstream']]) {
      const failure = await client.request('tools/call', { name, arguments: args });
      assert.equal(failure.isError, true);
      assert.equal(JSON.parse(failure.content[0].text).error.code, code);
      assert.equal(failure.structuredContent, undefined);
      assert.ok(!JSON.stringify(failure).includes('synthetic-secret'));
    }
  }
  assert.deepEqual(calls, ['/v1/apps/app1/appStoreVersions', '/v1/apps/missing/appStoreVersions',
    '/v1/apps/failure/appStoreVersions', '/v1/appStoreVersions/v1', '/v1/appStoreVersions/missing',
    '/v1/appStoreVersions/failure']);
  assert.equal(client.protocolError, false);
});

test('discovers and invokes list_apps over MCP stdio with safe errors and protocol-only output', async (t) => {
  let calls = 0;
  const server = createServer({ async get() { calls++; return { data: [], links: {} }; } });
  const input = new PassThrough();
  const output = new PassThrough();
  const client = rpc(input, output);
  await server.connect(new StdioServerTransport(input, output));
  t.after(async () => { client.close(); await server.close(); });
  await client.initialize();
  const { tools } = await client.request('tools/list');
  assert.deepEqual(tools.map((tool) => tool.name), ['list_apps', 'get_app', 'list_app_versions', 'get_app_version',
    'list_app_infos', 'list_app_info_localizations', 'list_version_localizations']);
  assert.equal(tools[0].name, 'list_apps');
  assert.equal(tools[0].annotations.readOnlyHint, true);
  assert.equal(tools[0].inputSchema.additionalProperties, false);
  const result = await client.request('tools/call', { name: 'list_apps', arguments: { limit: 1 } });
  assert.deepEqual(result.structuredContent, { items: [], nextCursor: null });
  assert.deepEqual(JSON.parse(result.content[0].text), result.structuredContent);
  for (const params of [{ name: 'list_apps', arguments: { 'synthetic-secret': true } }, { name: 'synthetic-secret' }]) {
    const failure = await client.request('tools/call', params);
    assert.equal(failure.isError, true);
    assert.equal(JSON.parse(failure.content[0].text).error.code, 'invalid_input');
    assert.ok(!JSON.stringify(failure).includes('synthetic-secret'));
  }
  assert.equal(calls, 1);
  assert.equal(client.protocolError, false);
});

test('discovers and invokes get_app over MCP with sanitized errors', async (t) => {
  const calls = [];
  const server = createServer({ async get(path) {
    calls.push(path);
    if (path.endsWith('/failure')) throw new Error('synthetic-secret');
    return { data: { id: '123', type: 'apps', attributes: {
      name: 'Synthetic App', bundleId: null, sku: null, primaryLocale: null, secret: 'synthetic-secret',
    } } };
  } });
  const input = new PassThrough();
  const output = new PassThrough();
  const client = rpc(input, output);
  await server.connect(new StdioServerTransport(input, output));
  t.after(async () => { client.close(); await server.close(); });
  await client.initialize();
  const { tools } = await client.request('tools/list');
  const tool = tools.find((tool) => tool.name === 'get_app');
  assert.equal(tool.annotations.readOnlyHint, true);
  assert.equal(tool.annotations.destructiveHint, false);
  assert.equal(tool.inputSchema.additionalProperties, false);
  assert.deepEqual(tool.inputSchema.required, ['appId']);
  const result = await client.request('tools/call', { name: 'get_app', arguments: { appId: '123' } });
  assert.deepEqual(result.structuredContent, { item: {
    id: '123', name: 'Synthetic App', bundleId: null, sku: null, primaryLocale: null,
  } });
  assert.deepEqual(JSON.parse(result.content[0].text), result.structuredContent);
  assert.ok(!JSON.stringify(result).includes('synthetic-secret'));
  for (const [args, code] of [[{}, 'invalid_input'], [{ appId: '../synthetic-secret' }, 'invalid_input'],
    [{ appId: '123', 'synthetic-secret': true }, 'invalid_input'], [{ appId: 'failure' }, 'upstream']]) {
    const failure = await client.request('tools/call', { name: 'get_app', arguments: args });
    assert.equal(failure.isError, true);
    assert.equal(JSON.parse(failure.content[0].text).error.code, code);
    assert.ok(!JSON.stringify(failure).includes('synthetic-secret'));
    assert.equal(failure.structuredContent, undefined);
  }
  assert.deepEqual(calls, ['/v1/apps/123', '/v1/apps/failure']);
  assert.equal(client.protocolError, false);
});

test('sanitizes upstream failures at the MCP boundary', async (t) => {
  const server = createServer({ async get() { throw new Error('synthetic-secret'); } });
  const input = new PassThrough();
  const output = new PassThrough();
  const client = rpc(input, output);
  await server.connect(new StdioServerTransport(input, output));
  t.after(async () => { client.close(); await server.close(); });
  await client.initialize();
  const result = await client.request('tools/call', { name: 'list_apps' });
  assert.equal(result.isError, true);
  assert.equal(JSON.parse(result.content[0].text).error.code, 'upstream');
  assert.ok(!JSON.stringify(result).includes('synthetic-secret'));
});
