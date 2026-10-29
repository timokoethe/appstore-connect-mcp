import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PassThrough } from 'node:stream';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { createServer } from '../build/server.js';
import { rpc } from './helpers/rpc.js';

test('group builds discover and invoke over MCP without tester identities', async (t) => {
  const attributes = { version: '42', uploadedDate: null, processingState: 'VALID', expirationDate: null, expired: false };
  const expected = { id: 'b1', buildNumber: '42', uploadedDate: null, processingState: 'VALID', expirationDate: null, expired: false, preReleaseVersionId: null, marketingVersion: null, platform: null, contextUnavailable: true };
  const page = { data: [{ id: 'b1', type: 'builds', attributes: {
    ...attributes, iconAssetToken: 'private-email',
  }, relationships: {
    individualTesters: { data: [{ id: 'tester1', type: 'betaTesters' }] },
  } }], included: [{
    id: 'tester1', type: 'betaTesters',
    attributes: { firstName: 'SyntheticPrivateTester', email: 'tester@example.invalid' },
  }], links: {} };
  const server = createServer({ async get() { return page; } });
  const input = new PassThrough();
  const output = new PassThrough();
  const client = rpc(input, output);
  await server.connect(new StdioServerTransport(input, output));
  t.after(async () => { client.close(); await server.close(); });
  await client.initialize();
  const { tools } = await client.request('tools/list');
  const tool = tools.find(({ name }) => name === 'list_beta_group_builds');
  assert.equal(tool.annotations.readOnlyHint, true);
  assert.equal(tool.inputSchema.additionalProperties, false);
  const result = await client.request('tools/call', { name: tool.name, arguments: { betaGroupId: 'g1' } });
  assert.deepEqual(result.structuredContent, { items: [expected], nextCursor: null });
  assert.deepEqual(JSON.parse(result.content[0].text), result.structuredContent);
  for (const privateValue of ['private-email', 'tester1', 'SyntheticPrivateTester', 'tester@example.invalid'])
    assert.ok(!JSON.stringify(result).includes(privateValue));
});


test('group builds paginate with sparse GET, preserve order and leave context unavailable', async () => {
  const { createListBetaGroupBuilds } = await import('../build/tools/list-beta-group-builds.js');
  const calls = [];
  const row = (id) => ({ id, type: 'builds', attributes: {
    version: '42', uploadedDate: null, processingState: 'FUTURE_STATE', expirationDate: null, expired: null,
  }, relationships: { preReleaseVersion: { data: { id: 'pr1', type: 'preReleaseVersions' } } } });
  const list = createListBetaGroupBuilds({ async get(path, query) {
    calls.push({ path, query });
    assert.equal(path, '/v1/betaGroups/g1/builds');
    assert.deepEqual(query, { 'fields[builds]': 'version,uploadedDate,processingState,expirationDate,expired,preReleaseVersion', limit: '1', ...(query.cursor ? { cursor: 'next' } : {}) });
    return { data: [row(query.cursor ? 'b2' : 'b1')], links: { next: query.cursor ? null : path + '?cursor=next' },
      included: [{ id: 'pr1', type: 'preReleaseVersions', attributes: { version: 'ignore', platform: 'IOS' } }] };
  } });
  const first = await list({ betaGroupId: 'g1', limit: 1 });
  await assert.rejects(list({ betaGroupId: 'g2', cursor: first.nextCursor }), { code: 'invalid_cursor' });
  const second = await list({ betaGroupId: 'g1', limit: 1, cursor: first.nextCursor });
  assert.deepEqual([...first.items, ...second.items].map(x => x.id), ['b1', 'b2']);
  assert.equal(second.nextCursor, null);
  assert.equal(first.items[0].marketingVersion, null);
  assert.equal(first.items[0].contextUnavailable, true);
  assert.equal(first.items[0].preReleaseVersionId, 'pr1');
  assert.equal(calls.length, 2);
});

test('group builds reject invalid inputs, malformed data and unsafe continuations', async () => {
  const { createListBetaGroupBuilds } = await import('../build/tools/list-beta-group-builds.js');
  const list = createListBetaGroupBuilds({ async get() { assert.fail('no request'); } });
  for (const args of [{}, { betaGroupId: '../x' }, { betaGroupId: 'g1', limit: 0 }, { betaGroupId: 'g1', include: 'betaTesters' }])
    await assert.rejects(list(args), { code: 'invalid_input' });
  for (const page of [{}, { data: [{ id: 'b1', type: 'builds', attributes: {} }], links: {} },
    { data: [], links: { next: 'https://example.invalid/private' } }])
    await assert.rejects(createListBetaGroupBuilds({ async get() { return page; } })({ betaGroupId: 'g1' }), { code: 'upstream' });
  assert.deepEqual(await createListBetaGroupBuilds({ async get() { return { data: [], links: {} }; } })({ betaGroupId: 'g1' }), { items: [], nextCursor: null });
});
