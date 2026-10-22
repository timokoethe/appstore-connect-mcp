import assert from 'node:assert/strict';
import crypto, { generateKeyPairSync, verify } from 'node:crypto';
import { syncBuiltinESMExports } from 'node:module';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { AuthError, createTokenProvider } from '../build/apple/auth.js';

async function fixture(t, curve = 'prime256v1') {
  const dir = await mkdtemp(join(tmpdir(), 'asc-auth-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: curve });
  const config = {
    keyId: 'TEST123456',
    issuerId: '11111111-2222-3333-4444-555555555555',
    privateKeyPath: join(dir, 'synthetic.p8'),
  };
  await writeFile(config.privateKeyPath, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  return { config, publicKey };
}

function payload(token) {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url'));
}

test('creates a verifiable ES256 JWT with Apple team-key claims', async (t) => {
  const { config, publicKey } = await fixture(t);
  const provider = await createTokenProvider(config, () => 1_800_000_000_999);
  const token = provider.getToken();
  const [header, body, signature] = token.split('.');
  assert.deepEqual(JSON.parse(Buffer.from(header, 'base64url')), {
    alg: 'ES256', kid: config.keyId, typ: 'JWT',
  });
  assert.deepEqual(payload(token), {
    iss: config.issuerId, iat: 1_800_000_000, exp: 1_800_000_600, aud: 'appstoreconnect-v1',
  });
  const bytes = Buffer.from(signature, 'base64url');
  assert.equal(bytes.length, 64);
  assert.ok(verify('sha256', Buffer.from(`${header}.${body}`), {
    key: publicKey, dsaEncoding: 'ieee-p1363',
  }, bytes));
  assert.ok(!verify('sha256', Buffer.from(`${header}.${body}x`), {
    key: publicKey, dsaEncoding: 'ieee-p1363',
  }, bytes));
});

test('reuses tokens and refreshes exactly 60 seconds before expiration', async (t) => {
  const { config } = await fixture(t);
  let time = 1_800_000_000_000;
  const provider = await createTokenProvider(config, () => time);
  const first = provider.getToken();
  time += 539_000;
  assert.equal(provider.getToken(), first);
  time += 1_000;
  const renewed = provider.getToken();
  assert.notEqual(renewed, first);
  assert.equal(payload(renewed).iat, time / 1000);
  time += 700_000;
  assert.equal(payload(provider.getToken()).iat, time / 1000);
});

test('regenerates when the clock moves before the cached token issuance', async (t) => {
  const { config } = await fixture(t);
  let time = 1_800_000_000_000;
  const provider = await createTokenProvider(config, () => time);
  provider.getToken();
  time -= 120_000;
  assert.equal(payload(provider.getToken()).iat, time / 1000);
});

test('keeps a valid cached token after a backwards change within its lifetime', async (t) => {
  const { config } = await fixture(t);
  let time = 1_800_000_000_000;
  const provider = await createTokenProvider(config, () => time);
  const first = provider.getToken();
  time += 120_000;
  assert.equal(provider.getToken(), first);
  time -= 60_000;
  assert.equal(provider.getToken(), first);
});

test('rejects invalid system time without exposing token data', async (t) => {
  const { config } = await fixture(t);
  for (const time of [NaN, Infinity, -1000]) {
    const provider = await createTokenProvider(config, () => time);
    assert.throws(() => provider.getToken(), AuthError);
  }
});

test('rejects missing or malformed keys with sanitized errors', async (t) => {
  const { config } = await fixture(t);
  for (const contents of [null, 'sensitive malformed key contents']) {
    if (contents === null) await rm(config.privateKeyPath);
    else await writeFile(config.privateKeyPath, contents);
    await assert.rejects(createTokenProvider(config), (error) => {
      assert.ok(error instanceof AuthError);
      assert.equal(error.cause, undefined);
      assert.ok(!error.stack.includes(config.privateKeyPath));
      assert.ok(!error.stack.includes('sensitive malformed key contents'));
      return true;
    });
  }
});

test('rejects keys on the wrong EC curve', async (t) => {
  const { config } = await fixture(t, 'secp384r1');
  await assert.rejects(createTokenProvider(config), {
    name: 'AuthError', message: 'The signing key must be an EC P-256 private key for ES256.',
  });
});

test('rejects a non-EC private key', async (t) => {
  const { config } = await fixture(t);
  const { privateKey } = generateKeyPairSync('ed25519');
  await writeFile(config.privateKeyPath, privateKey.export({ type: 'pkcs8', format: 'pem' }));
  await assert.rejects(createTokenProvider(config), {
    name: 'AuthError', message: 'The signing key must be an EC P-256 private key for ES256.',
  });
});

test('rejects an encrypted key without exposing key contents or the passphrase', async (t) => {
  const { config } = await fixture(t);
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const passphrase = 'synthetic-test-passphrase';
  const pem = privateKey.export({
    type: 'pkcs8', format: 'pem', cipher: 'aes-256-cbc', passphrase,
  });
  await writeFile(config.privateKeyPath, pem);
  await assert.rejects(createTokenProvider(config), (error) => {
    assert.ok(error instanceof AuthError);
    assert.equal(error.message, 'Unable to load the signing key. Check the configured .p8 file.');
    assert.equal(error.cause, undefined);
    for (const sensitive of [config.privateKeyPath, passphrase, pem]) {
      assert.ok(!error.stack.includes(sensitive));
    }
    return true;
  });
});

test('sanitizes signing errors and retries renewal without returning a stale token', async (t) => {
  const { config } = await fixture(t);
  let time = 1_800_000_000_000;
  const provider = await createTokenProvider(config, () => time);
  const first = provider.getToken();
  time += 540_000;

  // Patch the native signing boundary only; restore both CommonJS and ESM bindings.
  const mockedSign = t.mock.method(crypto, 'sign', () => {
    throw new Error(`synthetic sensitive signing failure ${first}`);
  });
  syncBuiltinESMExports();
  try {
    assert.throws(() => provider.getToken(), (error) => {
      assert.ok(error instanceof AuthError);
      assert.equal(error.message, 'Unable to sign the authentication token.');
      assert.equal(error.cause, undefined);
      assert.ok(!error.stack.includes(first));
      assert.ok(!error.stack.includes('synthetic sensitive signing failure'));
      return true;
    });
  } finally {
    mockedSign.mock.restore();
    syncBuiltinESMExports();
  }

  const renewed = provider.getToken();
  assert.notEqual(renewed, first);
  assert.equal(payload(renewed).iat, time / 1000);
});
