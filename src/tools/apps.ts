import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { AppleClientError, type AppleClient } from '../apple/client.js';
import { APP_FIELDS, appResource, toAppIdentity, type AppIdentity } from './app-schema.js';
import { ToolError } from './shared.js';

const CURSOR_TTL_MS = 10 * 60_000;
const MAX_CURSORS = 32;
export const listAppsInput = z.strictObject({
  bundleId: z.string().min(1).max(255).regex(/^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*$/).optional(),
  limit: z.number().int().min(1).max(100).default(20),
  cursor: z.string().regex(/^[A-Za-z0-9_-]{32}$/).optional(),
});
const responseSchema = z.object({
  data: z.array(appResource).max(100),
  links: z.object({ next: z.string().max(8192).nullable().optional() }),
});
const ERRORS = {
  invalid_input: 'Invalid list_apps arguments.',
  invalid_cursor: 'Cursor is invalid, expired, or belongs to different filters. Restart without a cursor.',
  output_too_large: 'Result exceeds the output budget. Retry with a smaller limit and the same cursor.',
  record_too_large: 'One app exceeds the output budget. This tool cannot retrieve that record.',
} as const;
export class AppsError extends ToolError {
  constructor(code: keyof typeof ERRORS) {
    super(code, ERRORS[code]);
    this.name = 'AppsError';
  }
}

type Query = Record<string, string>;
interface Page { items: AppIdentity[]; next: Query | null }
interface Position {
  bundleId?: string;
  query: Query;
  offset: number;
  page?: Promise<Page>;
  expiresAt: number;
}

function nextQuery(link: string | null | undefined, query: Query): Query | null {
  if (link == null) return null;
  try {
    const url = new URL(link, 'https://api.appstoreconnect.apple.com/v1/apps');
    if (url.origin !== 'https://api.appstoreconnect.apple.com' || url.pathname !== '/v1/apps'
      || url.username || url.password || url.hash) throw new Error();
    const seen = new Set<string>();
    for (const [key, value] of url.searchParams) {
      if (seen.has(key) || (key !== 'cursor' && value !== query[key])) throw new Error();
      seen.add(key);
    }
    const cursor = url.searchParams.get('cursor');
    if (!cursor || cursor.length > 4096 || cursor === query.cursor) throw new Error();
    // Preserve the original filters and page size even if Apple omits them in its link.
    return { ...query, cursor };
  } catch {
    throw new AppleClientError('upstream');
  }
}

/** One instance per MCP connection; cursors and buffered private metadata stay local. */
export function createListApps(
  client: AppleClient,
  { now = Date.now, maxOutputBytes = 32_768 }: { now?: () => number; maxOutputBytes?: number } = {},
) {
  if (!Number.isSafeInteger(maxOutputBytes) || maxOutputBytes < 1) throw new AppsError('invalid_input');
  const cursors = new Map<string, Position>();

  async function load(query: Query): Promise<Page> {
    const parsed = responseSchema.safeParse(await client.get('/v1/apps', query));
    if (!parsed.success || parsed.data.data.length > Number(query.limit)) throw new AppleClientError('upstream');
    const items = parsed.data.data.map(toAppIdentity);
    // Bound retained data independently of the HTTP client, including injected clients.
    if (Buffer.byteLength(JSON.stringify(items)) > 1_048_576) throw new AppleClientError('response_too_large');
    return { items, next: nextQuery(parsed.data.links.next, query) };
  }

  return async (input: unknown) => {
    const parsed = listAppsInput.safeParse(input);
    if (!parsed.success) throw new AppsError('invalid_input');
    const { bundleId, limit, cursor } = parsed.data;
    for (const [key, position] of cursors) {
      if (position.expiresAt <= now()) cursors.delete(key);
    }
    let position: Position;
    if (cursor) {
      const saved = cursors.get(cursor);
      if (!saved || saved.bundleId !== bundleId) throw new AppsError('invalid_cursor');
      position = saved;
    } else {
      position = {
        bundleId, offset: 0, expiresAt: now() + CURSOR_TTL_MS,
        query: { 'fields[apps]': APP_FIELDS, limit: String(limit),
          ...(bundleId === undefined ? {} : { 'filter[bundleId]': bundleId }) },
      };
    }
    // Share in-flight reads and keep failed output-budget calls replayable.
    position.page ??= load(position.query).catch((error: unknown) => {
      position.page = undefined;
      throw error;
    });
    const page = await position.page;
    const items = page.items.slice(position.offset, position.offset + limit);
    const offset = position.offset + items.length;
    const more = offset < page.items.length || page.next !== null;
    const nextCursor = more ? randomBytes(24).toString('base64url') : null;
    const result = { items, nextCursor };
    if (Buffer.byteLength(JSON.stringify(result)) > maxOutputBytes) {
      throw new AppsError(items.length <= 1 ? 'record_too_large' : 'output_too_large');
    }
    if (nextCursor) {
      while (cursors.size >= MAX_CURSORS) cursors.delete(cursors.keys().next().value!);
      cursors.set(nextCursor, offset < page.items.length
        ? { ...position, offset, expiresAt: now() + CURSOR_TTL_MS }
        : { bundleId, query: page.next!, offset: 0, expiresAt: now() + CURSOR_TTL_MS });
    }
    return result;
  };
}
