import { z } from 'zod';
import { AppleClientError, type AppleClient } from '../apple/client.js';
import { APP_FIELDS, appResource, toAppIdentity } from './app-schema.js';
import { createPaginator, paginationInput, pageLinks, type PaginationOptions } from './pagination.js';
import { ToolError } from './shared.js';

export const listAppsInput = z.strictObject({
  bundleId: z.string().min(1).max(255).regex(/^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*$/).optional(),
  ...paginationInput,
});
const responseSchema = z.object({ data: z.array(appResource).max(100), links: pageLinks });
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

export function createListApps(client: AppleClient, options: PaginationOptions = {}) {
  const paginate = createPaginator(async (path, query) => {
    const parsed = responseSchema.safeParse(await client.get(path, query));
    if (!parsed.success) throw new AppleClientError('upstream');
    return { items: parsed.data.data.map(toAppIdentity), next: parsed.data.links.next };
  }, options, (code) => new AppsError(code));
  return async (input: unknown) => {
    const parsed = listAppsInput.safeParse(input);
    if (!parsed.success) throw new AppsError('invalid_input');
    const { bundleId, limit, cursor } = parsed.data;
    return paginate({ path: '/v1/apps', limit, cursor, query: {
      'fields[apps]': APP_FIELDS,
      ...(bundleId === undefined ? {} : { 'filter[bundleId]': bundleId }),
    } });
  };
}
