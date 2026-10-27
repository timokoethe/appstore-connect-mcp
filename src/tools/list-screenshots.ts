import { z } from 'zod';
import { AppleClientError, type AppleClient } from '../apple/client.js';
import { createPaginator, paginationInput, pageLinks, type PaginationOptions } from './pagination.js';
import { resourceId, ToolError } from './shared.js';

export const listScreenshotsInput = z.strictObject({ screenshotSetId: resourceId, ...paginationInput });
const dimension = z.number().int().positive().nullable().optional();
const responseSchema = z.object({
  data: z.array(z.object({
    id: resourceId,
    type: z.literal('appScreenshots'),
    attributes: z.object({
      fileName: z.string().nullable(),
      imageAsset: z.object({ width: dimension, height: dimension }).nullable().optional(),
      assetDeliveryState: z.object({ state: z.string().nullable().optional() }).nullable().optional(),
    }),
  })).max(100),
  links: pageLinks,
});

export function createListScreenshots(client: AppleClient, options: PaginationOptions = {}) {
  const paginate = createPaginator(async (path, query) => {
    const response = responseSchema.safeParse(await client.get(path, query));
    if (!response.success) throw new AppleClientError('upstream');
    return {
      // Preserve Apple's ordered relationship; strip URLs, asset tokens and upload details.
      items: response.data.data.map(({ id, attributes }) => ({
        id,
        fileName: attributes.fileName,
        width: attributes.imageAsset?.width ?? null,
        height: attributes.imageAsset?.height ?? null,
        assetDeliveryState: attributes.assetDeliveryState?.state ?? null,
      })),
      next: response.data.links.next,
    };
  }, options);
  return async (input: unknown) => {
    const parsed = listScreenshotsInput.safeParse(input);
    if (!parsed.success) throw new ToolError('invalid_input', 'Invalid list_screenshots arguments.');
    const { screenshotSetId, limit, cursor } = parsed.data;
    return paginate({
      path: `/v1/appScreenshotSets/${encodeURIComponent(screenshotSetId)}/appScreenshots`,
      limit, cursor, query: { 'fields[appScreenshots]': 'fileName,imageAsset,assetDeliveryState' },
    });
  };
}
