import { setTimeout as sleep } from 'node:timers/promises';
import type { TokenProvider } from './auth.js';

const MAX_RETRIES = 2;
const MAX_RETRY_DELAY_MS = 5_000;
const RETRY_STATUSES = new Set([429, 502, 503, 504]);

const ORIGIN = 'https://api.appstoreconnect.apple.com';
const MESSAGES = {
  invalid_input: 'Invalid Apple API request.',
  authentication: 'Apple authentication failed. Check the configured credentials.',
  access_denied: 'Apple denied access. Check the API key permissions.',
  not_found: 'The requested Apple resource was not found.',
  rate_limited: 'Apple rate limit reached. Retry later.',
  upstream: 'Apple request failed. Retry later.',
  timeout: 'Apple request timed out. Retry later.',
  response_too_large: 'Apple response exceeded the size limit. Request less data.',
} as const;

export class AppleClientError extends Error {
  constructor(public readonly code: keyof typeof MESSAGES) {
    super(MESSAGES[code]);
    this.name = 'AppleClientError';
  }
}

export interface AppleClient {
  /** Internal JSON only: tools must validate and allowlist fields before returning data. */
  get(path: string, query?: Readonly<Record<string, string>>): Promise<unknown>;
}

interface ClientOptions {
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
  maxResponseBytes?: number;
  wait?: (milliseconds: number) => Promise<void>;
  now?: () => number;
}

async function readJson(response: Response, maxBytes: number): Promise<unknown> {
  if (!response.body) throw new AppleClientError('upstream');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        // Do not wait for cancellation or retain the oversized chunk.
        void reader.cancel().catch(() => {});
        throw new AppleClientError('response_too_large');
      }
      text += decoder.decode(value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } finally {
    reader.releaseLock();
  }
}

// A long server-requested wait ends this call rather than retrying too early.
function retryDelay(value: string | null, attempt: number, now: () => number): number {
  const fallback = 500 * 2 ** attempt;
  if (value === null) return fallback;
  if (/^\d+$/.test(value)) return Number(value) * 1_000;
  // Avoid Date.parse interpreting malformed numeric delays as calendar dates.
  if (!/^(?:[A-Za-z]{3},|[A-Za-z]+day,|[A-Za-z]{3} )/.test(value)) return fallback;
  // HTTP's legacy asctime format omits GMT but still denotes UTC.
  const asctime = /^[A-Za-z]{3} [A-Za-z]{3} [ \d]\d \d{2}:\d{2}:\d{2} \d{4}$/.test(value);
  const date = Date.parse(asctime ? `${value} GMT` : value);
  return Number.isFinite(date) ? Math.max(0, date - now()) : fallback;
}

/** Internal transport, not an MCP proxy. Dependencies are trusted application configuration. */
export function createAppleClient(
  tokens: TokenProvider,
  {
    fetch: fetchImpl = globalThis.fetch, timeoutMs = 10_000, maxResponseBytes = 1_048_576,
    wait = sleep, now = Date.now,
  }: ClientOptions = {},
): AppleClient {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 2_147_483_647) {
    throw new AppleClientError('invalid_input');
  }
  if (!Number.isSafeInteger(maxResponseBytes) || maxResponseBytes < 1) {
    throw new AppleClientError('invalid_input');
  }

  return Object.freeze({
    async get(path: string, query: Readonly<Record<string, string>> = {}): Promise<unknown> {
      // Deliberately narrow paths: no URLs, escapes, dot segments, queries or fragments.
      if (typeof path !== 'string' || !/^\/v[12]\/[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*$/.test(path)) {
        throw new AppleClientError('invalid_input');
      }
      const url = new URL(path, ORIGIN);
      try {
        if (!query || typeof query !== 'object' || Array.isArray(query)) throw new Error();
        for (const [key, value] of Object.entries(query)) {
          if (typeof value !== 'string') throw new Error();
          url.searchParams.set(key, value);
        }
      } catch {
        throw new AppleClientError('invalid_input');
      }

      for (let attempt = 0; ; attempt++) {
        let token: string;
        try {
          token = tokens.getToken();
        } catch {
          throw new AppleClientError('authentication');
        }

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        let retryable = false;
        let delay = 500 * 2 ** attempt;
        let failure: AppleClientError;
        try {
          const response = await fetchImpl(url, {
            method: 'GET',
            headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
            redirect: 'manual',
            signal: controller.signal,
          });
          if (!response.ok) {
            // Release the body before retrying, without exposing Apple's error payload.
            void response.body?.cancel().catch(() => {});
            retryable = RETRY_STATUSES.has(response.status);
            if (retryable) delay = retryDelay(response.headers.get('retry-after'), attempt, now);
            const code = response.status === 401 ? 'authentication'
              : response.status === 403 ? 'access_denied'
              : response.status === 404 ? 'not_found'
              : response.status === 429 ? 'rate_limited'
              : 'upstream';
            throw new AppleClientError(code);
          }
          return await readJson(response, maxResponseBytes);
        } catch (error) {
          if (controller.signal.aborted) throw new AppleClientError('timeout');
          if (error instanceof AppleClientError) {
            failure = error;
          } else {
            // JSON syntax errors are permanent; transport failures may be transient.
            retryable = !(error instanceof SyntaxError);
            failure = new AppleClientError('upstream');
          }
        } finally {
          clearTimeout(timer);
        }
        if (!retryable || attempt >= MAX_RETRIES || delay > MAX_RETRY_DELAY_MS) throw failure;
        try {
          await wait(delay);
        } catch {
          throw new AppleClientError('upstream');
        }
      }
    },
  });
}
