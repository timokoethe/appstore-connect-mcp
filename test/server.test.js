import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { test } from 'node:test';
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { createServer } from '../build/server.js';
import { rpc } from './helpers/rpc.js';

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
  assert.equal(tools.length, 1);
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
