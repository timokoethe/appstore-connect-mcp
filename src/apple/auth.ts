import { createPrivateKey, sign, type KeyObject } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { Config } from '../config.js';

const TOKEN_LIFETIME_SECONDS = 600;
const REFRESH_MARGIN_SECONDS = 60;

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

export interface TokenProvider {
  /** Sensitive: use only in the Authorization header, never in logs or tool results. */
  getToken(): string;
}

function encode(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

/** Load once from validated process configuration; restart after rotating the key. */
export async function createTokenProvider(
  config: Config,
  now: () => number = Date.now,
): Promise<TokenProvider> {
  let key: KeyObject;
  try {
    key = createPrivateKey(await readFile(config.privateKeyPath));
  } catch {
    throw new AuthError('Unable to load the signing key. Check the configured .p8 file.');
  }
  if (key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails?.namedCurve !== 'prime256v1') {
    throw new AuthError('The signing key must be an EC P-256 private key for ES256.');
  }

  const header = encode({ alg: 'ES256', kid: config.keyId, typ: 'JWT' });
  const issuerId = config.issuerId;
  let cached: { token: string; issuedAt: number; expiresAt: number } | undefined;

  return Object.freeze({
    getToken(): string {
      const issuedAt = Math.floor(now() / 1000);
      if (!Number.isSafeInteger(issuedAt) || issuedAt < 0) {
        throw new AuthError('Cannot generate a token: invalid system time.');
      }
      if (cached && issuedAt >= cached.issuedAt && issuedAt < cached.expiresAt - REFRESH_MARGIN_SECONDS) {
        return cached.token;
      }

      const expiresAt = issuedAt + TOKEN_LIFETIME_SECONDS;
      const payload = encode({ iss: issuerId, iat: issuedAt, exp: expiresAt, aud: 'appstoreconnect-v1' });
      const input = `${header}.${payload}`;
      let signature: string;
      try {
        // JWT ES256 uses fixed-width R || S, rather than OpenSSL's default DER encoding.
        signature = sign('sha256', Buffer.from(input), {
          key, dsaEncoding: 'ieee-p1363',
        }).toString('base64url');
      } catch {
        throw new AuthError('Unable to sign the authentication token.');
      }
      cached = { token: `${input}.${signature}`, issuedAt, expiresAt };
      return cached.token;
    },
  });
}
