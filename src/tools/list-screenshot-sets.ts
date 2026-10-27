import { z } from 'zod';
import { AppleClientError, type AppleClient } from '../apple/client.js';
import { createPaginator, paginationInput, pageLinks, type PaginationOptions } from './pagination.js';
import { resourceId, ToolError } from './shared.js';

export const listScreenshotSetsInput = z.strictObject({ versionLocalizationId: resourceId, ...paginationInput });
const responseSchema = z.object({
  data: z.array(z.object({
    id: resourceId,
    type: z.literal('appScreenshotSets'),
    attributes: z.object({ screenshotDisplayType: z.string().nullable() }),
  })).max(100),
  links: pageLinks,
});

export function createListScreenshotSets(client: AppleClient, options: PaginationOptions = {}) {
  const paginate = createPaginator(async (path, query) => {
    const response = responseSchema.safeParse(await client.get(path, query));
    if (!response.success) throw new AppleClientError('upstream');
    return {
      items: response.data.data.map(({ id, attributes }) => ({ id, ...attributes })),
      next: response.data.links.next,
    };
  }, options);
  return async (input: unknown) => {
    const parsed = listScreenshotSetsInput.safeParse(input);
    if (!parsed.success) throw new ToolError('invalid_input', 'Invalid list_screenshot_sets arguments.');
    const { versionLocalizationId, limit, cursor } = parsed.data;
    return paginate({
      path: `/v1/appStoreVersionLocalizations/${encodeURIComponent(versionLocalizationId)}/appScreenshotSets`,
      limit, cursor, query: { 'fields[appScreenshotSets]': 'screenshotDisplayType' },
    });
  };
}
