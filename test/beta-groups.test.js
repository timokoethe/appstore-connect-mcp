import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PassThrough } from 'node:stream';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { createServer } from '../build/server.js';
import { rpc } from './helpers/rpc.js';

test('beta groups discover and invoke over MCP without tester identities', async (t) => {
  const attributes = { name: 'Synthetic group', isInternalGroup: true };
  const page = { data: [{ id: 'g1', type: 'betaGroups', attributes: {
    ...attributes, publicLink: 'private-email',
  }, relationships: { betaTesters: { data: [{ email: 'private-email' }] } } }], links: {} };
  const server = createServer({ async get() { return page; } });
  const input = new PassThrough();
  const output = new PassThrough();
  const client = rpc(input, output);
  await server.connect(new StdioServerTransport(input, output));
  t.after(async () => { client.close(); await server.close(); });
  await client.initialize();
  const { tools } = await client.request('tools/list');
  const tool = tools.find(({ name }) => name === 'list_beta_groups');
  assert.equal(tool.annotations.readOnlyHint, true);
  assert.equal(tool.inputSchema.additionalProperties, false);
  const result = await client.request('tools/call', { name: tool.name, arguments: { appId: 'app1' } });
  assert.deepEqual(result.structuredContent, { items: [{ id: 'g1', ...attributes }], nextCursor: null });
  assert.deepEqual(JSON.parse(result.content[0].text), result.structuredContent);
  assert.ok(!JSON.stringify(result).includes('private-email'));
});
