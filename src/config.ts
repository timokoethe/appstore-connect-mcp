import { constants, type Stats } from 'node:fs';
import { access, stat } from 'node:fs/promises';
import { extname, resolve } from 'node:path';

export interface Config {
  readonly keyId: string;
  readonly issuerId: string;
  readonly privateKeyPath: string;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new ConfigError(`${name} is required.`);
  }
  return value;
}

/** Read trusted process configuration only; never pass MCP tool arguments here. */
export async function loadConfig(env: NodeJS.ProcessEnv = process.env): Promise<Config> {
  const keyId = required(env, 'ASC_KEY_ID');
  const issuerId = required(env, 'ASC_ISSUER_ID');
  const keyPath = required(env, 'ASC_PRIVATE_KEY_PATH');

  if (!/^[A-Z0-9]{10}$/.test(keyId)) {
    throw new ConfigError('ASC_KEY_ID must contain 10 uppercase letters or digits.');
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(issuerId)) {
    throw new ConfigError('ASC_ISSUER_ID must be a UUID.');
  }
  if (keyPath.includes('\0') || extname(keyPath) !== '.p8') {
    throw new ConfigError('ASC_PRIVATE_KEY_PATH must be a path to a .p8 file.');
  }

  const privateKeyPath = resolve(keyPath);
  const fileError = 'ASC_PRIVATE_KEY_PATH must point to a readable, non-empty regular file.';
  let info: Stats;
  try {
    info = await stat(privateKeyPath);
    await access(privateKeyPath, constants.R_OK);
  } catch {
    // File-system errors include local paths; never expose the original error.
    throw new ConfigError(fileError);
  }
  if (!info.isFile() || info.size === 0) {
    throw new ConfigError(fileError);
  }

  return Object.freeze({ keyId, issuerId, privateKeyPath });
}
