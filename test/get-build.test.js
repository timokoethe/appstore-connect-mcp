import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PassThrough } from 'node:stream';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { createGetBuild } from '../build/tools/get-build.js';
import { createAppleClient, AppleClientError } from '../build/apple/client.js';
import { createServer } from '../build/server.js';
import { rpc } from './helpers/rpc.js';

const link = (type, id) => ({ data: { type, id } });
const fixture = () => ({ data: {
  id: 'b1', type: 'builds', attributes: { version: '42', uploadedDate: null, processingState: 'VALID', expirationDate: null, expired: false, iconAssetToken: 'secret' },
  relationships: { preReleaseVersion: link('preReleaseVersions', 'p1'), buildBetaDetail: link('buildBetaDetails', 'd1') },
}, included: [
  { id: 'unrelated', type: 'buildBetaDetails', attributes: { internalBuildState: 'WRONG', externalBuildState: 'WRONG' } },
  { id: 'd1', type: 'buildBetaDetails', attributes: { internalBuildState: 'IN_BETA_TESTING', externalBuildState: 'FUTURE_STATE', secret: 'secret' } },
  { id: 'p1', type: 'preReleaseVersions', attributes: { version: '1.0', platform: 'IOS' } },
] });
const expected = { id: 'b1', buildNumber: '42', uploadedDate: null, processingState: 'VALID', expirationDate: null, expired: false,
  preReleaseVersionId: 'p1', marketingVersion: '1.0', platform: 'IOS', contextUnavailable: false,
  buildBetaDetailId: 'd1', internalBuildState: 'IN_BETA_TESTING', externalBuildState: 'FUTURE_STATE', betaStatusUnavailable: false };

test('get_build issues one sparse GET and joins context by exact IDs', async () => {
  let calls = 0;
  const client = createAppleClient({ getToken: () => 'synthetic' }, { fetch: async (url, options) => {
    calls++;
    assert.equal(options.method, 'GET');
    assert.equal(url.pathname, '/v1/builds/b1');
    assert.deepEqual(Object.fromEntries(url.searchParams), {
      'fields[builds]': 'version,uploadedDate,processingState,expirationDate,expired,preReleaseVersion,buildBetaDetail',
      include: 'preReleaseVersion,buildBetaDetail', 'fields[preReleaseVersions]': 'version,platform',
      'fields[buildBetaDetails]': 'internalBuildState,externalBuildState',
    });
    return Response.json(fixture());
  } });
  assert.deepEqual(await createGetBuild(client)({ buildId: 'b1' }), { item: expected });
  assert.equal(calls, 1);
});

test('missing, null, links-only and unmatched beta context remain unavailable', async () => {
  for (const relationship of [undefined, { data: null }, { links: {} }, link('buildBetaDetails', 'missing')]) {
    const raw = fixture();
    raw.data.relationships.buildBetaDetail = relationship;
    const { item } = await createGetBuild({ async get() { return raw; } })({ buildId: 'b1' });
    assert.equal(item.betaStatusUnavailable, true);
    assert.equal(item.internalBuildState, null);
    assert.equal(item.externalBuildState, null);
  }
  const raw = fixture();
  delete raw.data.relationships;
  delete raw.included;
  const { item } = await createGetBuild({ async get() { return raw; } })({ buildId: 'b1' });
  assert.equal(item.contextUnavailable, true);
  assert.equal(item.betaStatusUnavailable, true);
});

test('invalid arguments fail before access', async () => {
  const get = createGetBuild({ async get() { assert.fail('must not request'); } });
  for (const input of [null, {}, { buildId: '../secret' }, { buildId: 'b1', include: 'individualTesters' }]) {
    await assert.rejects(get(input), { code: 'invalid_input' });
  }
});

test('malformed or ambiguous resources fail safely', async () => {
  const mutations = [
    (r) => { r.data.id = 'other'; },
    (r) => { delete r.data.attributes.version; },
    (r) => { r.data.relationships.buildBetaDetail = link('apps', 'd1'); },
    (r) => { r.included.push(r.included[1]); },
    (r) => { delete r.included[1].attributes.externalBuildState; },
    (r) => { r.included[2].attributes.platform = 42; },
  ];
  for (const mutate of mutations) {
    const raw = fixture(); mutate(raw);
    await assert.rejects(createGetBuild({ async get() { return raw; } })({ buildId: 'b1' }), { code: 'upstream' });
  }
});

test('partial beta state stays explicit and UTF-8 output is bounded', async () => {
  const raw = fixture(); raw.included[1].attributes.externalBuildState = null;
  const get = createGetBuild({ async get() { return raw; } });
  assert.equal((await get({ buildId: 'b1' })).item.betaStatusUnavailable, true);
  raw.data.attributes.version = 'é'.repeat(17000);
  await assert.rejects(get({ buildId: 'b1' }), { code: 'record_too_large' });
  for (const code of ['not_found', 'access_denied', 'authentication', 'timeout']) {
    await assert.rejects(createGetBuild({ async get() { throw new AppleClientError(code); } })({ buildId: 'b1' }), { code });
  }
});

test('get_build discovers and invokes over MCP with safe errors', async (t) => {
  const server = createServer({ async get(path) { if (path.endsWith('/missing')) throw new AppleClientError('not_found'); return fixture(); } });
  const input = new PassThrough(); const output = new PassThrough(); const client = rpc(input, output);
  await server.connect(new StdioServerTransport(input, output));
  t.after(async () => { client.close(); await server.close(); });
  await client.initialize();
  const { tools } = await client.request('tools/list');
  const tool = tools.find(({ name }) => name === 'get_build');
  assert.equal(tool.annotations.readOnlyHint, true);
  assert.equal(tool.inputSchema.additionalProperties, false);
  const result = await client.request('tools/call', { name: tool.name, arguments: { buildId: 'b1' } });
  assert.deepEqual(result.structuredContent, { item: expected });
  assert.deepEqual(JSON.parse(result.content[0].text), result.structuredContent);
  assert.ok(!JSON.stringify(result).includes('secret'));
  const error = await client.request('tools/call', { name: tool.name, arguments: { buildId: 'missing' } });
  assert.equal(error.isError, true);
  assert.equal(JSON.parse(error.content[0].text).error.code, 'not_found');
});
