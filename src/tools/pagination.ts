import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { AppleClientError } from '../apple/client.js';
import { ToolError } from './shared.js';

const CURSOR_TTL_MS = 10 * 60_000;
const MAX_CURSORS = 32;
export const paginationInput = {
  limit: z.number().int().min(1).max(100).default(20),
  cursor: z.string().regex(/^[A-Za-z0-9_-]{32}$/).optional(),
};
export const pageLinks = z.object({ next: z.string().max(8192).nullable().optional() });
export interface PaginationOptions {
  now?: () => number;
  maxOutputBytes?: number;
  /** Fetch fixed upstream pages and serve caller-sized slices from the buffer. */
  upstreamPageSize?: number;
}
const MESSAGES = {
  invalid_input: 'Invalid pagination configuration.',
  invalid_cursor: 'Cursor is invalid, expired, or belongs to different filters. Restart without a cursor.',
  output_too_large: 'Result exceeds the output budget. Retry with a smaller limit and the same cursor.',
  record_too_large: 'One record exceeds the output budget. This tool cannot retrieve that record.',
} as const;
type PaginationError = keyof typeof MESSAGES;

type Query = Record<string, string>;
interface Page<T> { items: T[]; next: Query | null }
interface Position<T> {
  scope: string;
  path: string;
  query: Query;
  offset: number;
  page?: Promise<Page<T>>;
  expiresAt: number;
}

function sameQueryValue(key: string, actual: string, expected: string | undefined): boolean {
  if (actual === expected) return true;
  if (!/^fields\[[A-Za-z0-9]+\]$/.test(key) || expected === undefined) return false;
  // Apple may reorder sparse fieldsets in links. Keep our original query for the request.
  const fields = actual.split(',');
  return new Set(fields).size === fields.length
    && JSON.stringify(fields.sort()) === JSON.stringify(expected.split(',').sort());
}

function nextQuery(path: string, link: string | null | undefined, query: Query): Query | null {
  if (link == null) return null;
  try {
    const url = new URL(link, `https://api.appstoreconnect.apple.com${path}`);
    if (url.origin !== 'https://api.appstoreconnect.apple.com' || url.pathname !== path
      || url.username || url.password || url.hash) throw new Error();
    const seen = new Set<string>();
    for (const [key, value] of url.searchParams) {
      if (seen.has(key) || (key !== 'cursor' && !sameQueryValue(key, value, query[key]))) throw new Error();
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

/** One instance per tool and connection. Paths and query fields come from validated tool inputs. */
export function createPaginator<T>(
  fetchPage: (path: string, query: Query) => Promise<{ items: T[]; next?: string | null }>,
  { now = Date.now, maxOutputBytes = 32_768, upstreamPageSize }: PaginationOptions = {},
  error: (code: PaginationError) => ToolError = (code) => new ToolError(code, MESSAGES[code]),
) {
  if (!Number.isSafeInteger(maxOutputBytes) || maxOutputBytes < 1) throw error('invalid_input');
  if (upstreamPageSize !== undefined && (!Number.isInteger(upstreamPageSize) || upstreamPageSize < 1 || upstreamPageSize > 100)) {
    throw error('invalid_input');
  }
  const cursors = new Map<string, Position<T>>();
  async function load(path: string, query: Query): Promise<Page<T>> {
    const page = await fetchPage(path, query);
    if (page.items.length > Number(query.limit)) throw new AppleClientError('upstream');
    if (Buffer.byteLength(JSON.stringify(page.items)) > 1_048_576) throw new AppleClientError('response_too_large');
    return { items: page.items, next: nextQuery(path, page.next, query) };
  }
  return async ({ path, query, limit, cursor }: {
    path: string; query: Query; limit: number; cursor?: string;
  }) => {
    // Page size is deliberately excluded: smaller retries must preserve the original Apple page.
    const scope = JSON.stringify([path, Object.entries(query).filter(([key]) => key !== 'limit')
      .sort(([a], [b]) => a.localeCompare(b))]);
    for (const [key, position] of cursors) {
      if (position.expiresAt <= now()) cursors.delete(key);
    }
    let position: Position<T>;
    if (cursor) {
      const saved = cursors.get(cursor);
      if (!saved || saved.scope !== scope) throw error('invalid_cursor');
      position = saved;
    } else {
      position = {
        scope, path, offset: 0, expiresAt: now() + CURSOR_TTL_MS,
        query: { ...query, limit: String(upstreamPageSize ?? limit) },
      };
    }
    // Share in-flight reads and keep failed output-budget calls replayable.
    position.page ??= load(position.path, position.query).catch((error: unknown) => {
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
      throw error(items.length <= 1 ? 'record_too_large' : 'output_too_large');
    }
    if (nextCursor) {
      while (cursors.size >= MAX_CURSORS) cursors.delete(cursors.keys().next().value!);
      cursors.set(nextCursor, offset < page.items.length
        ? { ...position, offset, expiresAt: now() + CURSOR_TTL_MS }
        : { scope, path, query: page.next!, offset: 0, expiresAt: now() + CURSOR_TTL_MS });
    }
    return result;
  };
}
