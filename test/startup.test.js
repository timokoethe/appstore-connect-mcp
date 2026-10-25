import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { rpc } from './helpers/rpc.js';

const entry = new URL('../build/index.js', import.meta.url);

test('startup failures exit without stdout or sensitive diagnostics', async () => {
  const child = spawn(process.execPath, [entry.pathname], { env: { ASC_KEY_ID: 'synthetic-secret' } });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const [exitCode] = await once(child, 'close');
  assert.equal(exitCode, 1);
  assert.equal(stdout, '');
  assert.equal(stderr, 'Unable to start App Store Connect MCP. Check configuration and signing key.\n');
});

test('compiled entry point starts stdio and discovers tools using a synthetic key', async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'asc-startup-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, 'synthetic.p8');
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  await writeFile(path, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  const child = spawn(process.execPath, [entry.pathname], { env: {
    ASC_KEY_ID: 'TEST123456', ASC_ISSUER_ID: '11111111-2222-3333-4444-555555555555', ASC_PRIVATE_KEY_PATH: path,
  } });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const client = rpc(child.stdin, child.stdout);
  t.after(async () => { client.close(); const closed = once(child, 'close'); child.kill(); await closed; });
  await client.initialize();
  const { tools } = await client.request('tools/list');
  assert.deepEqual(tools.map((tool) => tool.name), ['list_apps', 'get_app', 'list_app_versions', 'get_app_version',
    'list_app_infos', 'list_app_info_localizations']);
  assert.equal(stderr, '');
  assert.equal(client.protocolError, false);
});
