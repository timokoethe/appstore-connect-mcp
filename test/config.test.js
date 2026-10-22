import assert from 'node:assert/strict';
import { access, chmod, mkdtemp, writeFile, mkdir, rm, symlink } from 'node:fs/promises';
import { constants } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { test } from 'node:test';
import { ConfigError, loadConfig } from '../build/config.js';

async function createFixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'asc-config-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, 'synthetic.p8');
  await writeFile(path, 'synthetic file contents, not a real private key');
  const env = {
    ASC_KEY_ID: 'TEST123456',
    ASC_ISSUER_ID: '11111111-2222-3333-4444-555555555555',
    ASC_PRIVATE_KEY_PATH: path,
  };
  return { dir, path, env };
}

test('returns only the configured identifiers and key path as an immutable object', async (t) => {
  const { path, env } = await createFixture(t);
  const config = await loadConfig(env);
  assert.deepEqual(config, {
    keyId: env.ASC_KEY_ID, issuerId: env.ASC_ISSUER_ID, privateKeyPath: path,
  });
  assert.equal(Object.isFrozen(config), true);
});

test('trims surrounding whitespace and resolves relative paths', async (t) => {
  const { path, env } = await createFixture(t);
  const config = await loadConfig({
    ...env,
    ASC_KEY_ID: ` ${env.ASC_KEY_ID} `,
    ASC_ISSUER_ID: ` ${env.ASC_ISSUER_ID} `,
    ASC_PRIVATE_KEY_PATH: relative(process.cwd(), path),
  });
  assert.equal(config.keyId, env.ASC_KEY_ID);
  assert.equal(config.privateKeyPath, path);
});

for (const name of ['ASC_KEY_ID', 'ASC_ISSUER_ID', 'ASC_PRIVATE_KEY_PATH']) {
  for (const value of [undefined, '', '  ']) {
    test(`rejects missing or blank ${name}: ${String(value)}`, async (t) => {
      const { env } = await createFixture(t);
      await assert.rejects(loadConfig({ ...env, [name]: value }), {
        name: 'ConfigError', message: `${name} is required.`,
      });
    });
  }
}

for (const [name, value] of [
  ['ASC_KEY_ID', 'secret-invalid-key'],
  ['ASC_ISSUER_ID', 'secret-invalid-issuer'],
  ['ASC_PRIVATE_KEY_PATH', '/secret/location/key.pem'],
  ['ASC_PRIVATE_KEY_PATH', '/secret/location/missing.p8'],
  ['ASC_PRIVATE_KEY_PATH', 'secret\0.p8'],
]) {
  test(`rejects invalid ${name} without exposing input`, async (t) => {
    const { env } = await createFixture(t);
    await assert.rejects(loadConfig({ ...env, [name]: value }), (error) => {
      assert.ok(error instanceof ConfigError);
      assert.ok(error.message.includes(name));
      assert.ok(!error.stack.includes(value));
      assert.equal(error.cause, undefined);
      return true;
    });
  });
}

test('rejects directories and empty files', async (t) => {
  const { dir, env } = await createFixture(t);
  const directory = join(dir, 'directory.p8');
  const empty = join(dir, 'empty.p8');
  await mkdir(directory);
  await writeFile(empty, '');
  for (const candidate of [directory, empty]) {
    await assert.rejects(loadConfig({ ...env, ASC_PRIVATE_KEY_PATH: candidate }), ConfigError);
  }
});

test('rejects an unreadable file without exposing its path', {
  skip: process.platform === 'win32' || process.getuid?.() === 0
    ? 'POSIX read permissions require a non-root Unix process.'
    : false,
}, async (t) => {
  const { dir, env } = await createFixture(t);
  const unreadable = join(dir, 'unreadable.p8');
  await writeFile(unreadable, 'synthetic private content');
  await chmod(unreadable, 0o000);

  try {
    // Verify the fixture really is unreadable before exercising the loader.
    await assert.rejects(access(unreadable, constants.R_OK), { code: 'EACCES' });
    await assert.rejects(loadConfig({ ...env, ASC_PRIVATE_KEY_PATH: unreadable }), (error) => {
      assert.ok(error instanceof ConfigError);
      assert.equal(error.message,
        'ASC_PRIVATE_KEY_PATH must point to a readable, non-empty regular file.');
      assert.ok(!error.stack.includes(unreadable));
      assert.ok(!error.stack.includes('synthetic private content'));
      assert.equal(error.cause, undefined);
      return true;
    });
  } finally {
    await chmod(unreadable, 0o600);
  }
});

test('accepts a symlink to a readable key file', async (t) => {
  const { dir, path, env } = await createFixture(t);
  const link = join(dir, 'link.p8');
  await symlink(path, link);
  assert.equal((await loadConfig({ ...env, ASC_PRIVATE_KEY_PATH: link })).privateKeyPath, link);
});
