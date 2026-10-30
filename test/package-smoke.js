import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { rpc } from './helpers/rpc.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

test('packed CLI installs offline and discovers tools over stdio', { timeout: 90_000 }, async (t) => {
  const dir = await mkdtemp(join(tmpdir(), 'asc-package-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  const lock = JSON.parse(await readFile(join(root, 'package-lock.json'), 'utf8'));
  const marker = `obsolete-${dir.split(/[/\\]/).pop()}.js`;
  const markerPath = join(root, 'build', marker);
  await mkdir(join(root, 'build'), { recursive: true });
  await writeFile(markerPath, '// Synthetic stale build artifact\n');
  t.after(() => rm(markerPath, { force: true }));

  const runNpm = (args, cwd = root) => execFileSync(npm, args, {
    cwd, encoding: 'utf8', timeout: 60_000,
    env: { ...process.env, npm_config_offline: 'true', npm_config_update_notifier: 'false' },
  });
  const [packed] = JSON.parse(runNpm(['pack', '--silent', '--json', '--pack-destination', dir]));
  const paths = packed.files.map(({ path }) => path);
  for (const required of ['build/index.js', 'package.json', 'README.md', 'LICENSE', 'SECURITY.md']) {
    assert.ok(paths.includes(required), `Missing package file: ${required}`);
  }
  assert.ok(!paths.includes(`build/${marker}`), 'prepack must remove stale build artifacts');
  assert.ok(paths.every((path) => /^(build\/|docs\/|package.json$|README.md$|LICENSE$|SECURITY.md$)/.test(path)),
    'Package must contain only runtime files and documentation');
  assert.ok(!paths.some((path) => /(?:^|\/)(?:\.env(?:\.|$)|.*\.(?:p8|pem)$)/.test(path)),
    'Package must exclude credentials');

  // Reuse the exact dependency graph from npm ci, avoiding registry resolution.
  // The initial npm ci populates the cache; this installation must stay offline.
  const tarball = `file:${join(dir, packed.filename)}`;
  const dependencies = { ...manifest.dependencies, [manifest.name]: tarball };
  const installManifest = { name: 'asc-package-smoke', version: '1.0.0', private: true, dependencies };
  lock.name = installManifest.name;
  lock.version = installManifest.version;
  lock.packages[''] = installManifest;
  lock.packages[`node_modules/${manifest.name}`] = {
    version: manifest.version, resolved: tarball,
    dependencies: manifest.dependencies, bin: manifest.bin, engines: manifest.engines,
  };
  await writeFile(join(dir, 'package.json'), JSON.stringify(installManifest));
  await writeFile(join(dir, 'package-lock.json'), JSON.stringify(lock));
  runNpm(['ci', '--offline', '--ignore-scripts', '--omit=dev', '--no-audit', '--no-fund'], dir);

  const installedEntry = join(dir, 'node_modules', manifest.name, 'build/index.js');
  assert.ok((await readFile(installedEntry, 'utf8')).startsWith('#!/usr/bin/env node\n'));
  const keyPath = join(dir, 'synthetic.p8');
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  await writeFile(keyPath, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  const child = spawn(join(dir, 'node_modules/.bin/appstoreconnect-mcp'), [], {
    cwd: dir,
    env: {
      PATH: `${dirname(process.execPath)}${delimiter}${process.env.PATH ?? ''}`,
      ASC_KEY_ID: 'TEST123456',
      ASC_ISSUER_ID: '11111111-2222-3333-4444-555555555555',
      ASC_PRIVATE_KEY_PATH: keyPath,
    },
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const client = rpc(child.stdin, child.stdout);
  t.after(async () => {
    client.close();
    if (child.exitCode === null && child.signalCode === null) {
      const closed = once(child, 'close');
      child.kill();
      await closed;
    }
  });
  await once(child, 'spawn');
  await client.initialize();
  const { tools } = await client.request('tools/list');
  const { createToolRegistry } = await import('../build/tools/registry.js');
  assert.deepEqual(tools.map(({ name }) => name), [...createToolRegistry({}).keys()]);
  // Invalid input exercises invocation without making an Apple request.
  const result = await client.request('tools/call', { name: 'list_apps', arguments: { limit: 0 } });
  assert.equal(result.isError, true);
  assert.equal(JSON.parse(result.content[0].text).error.code, 'invalid_input');
  assert.equal(stderr, '');
  assert.equal(client.protocolError, false);
});
