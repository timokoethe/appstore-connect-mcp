import { z } from 'zod';
import { AppleClientError, type AppleClient } from '../apple/client.js';
import { createPaginator, paginationInput, pageLinks, type PaginationOptions } from './pagination.js';
import { resourceId, ToolError } from './shared.js';
import { VERSION_FIELDS, versionResource, toVersion } from './version-schema.js';

export const listAppVersionsInput = z.strictObject({
  appId: resourceId,
  platform: z.enum(['IOS', 'MAC_OS', 'TV_OS', 'VISION_OS']).optional(),
  ...paginationInput,
});
const responseSchema = z.object({ data: z.array(versionResource).max(100), links: pageLinks });

export function createListAppVersions(client: AppleClient, options: PaginationOptions = {}) {
  const paginate = createPaginator(async (path, query) => {
    const parsed = responseSchema.safeParse(await client.get(path, query));
    if (!parsed.success) throw new AppleClientError('upstream');
    const platform = query['filter[platform]'];
    if (platform && parsed.data.data.some((version) => version.attributes.platform !== platform)) {
      throw new AppleClientError('upstream');
    }
    return { items: parsed.data.data.map(toVersion), next: parsed.data.links.next };
  }, options);
  return async (input: unknown) => {
    const parsed = listAppVersionsInput.safeParse(input);
    if (!parsed.success) throw new ToolError('invalid_input', 'Invalid list_app_versions arguments.');
    const { appId, platform, limit, cursor } = parsed.data;
    return paginate({ path: `/v1/apps/${encodeURIComponent(appId)}/appStoreVersions`, limit, cursor, query: {
      'fields[appStoreVersions]': VERSION_FIELDS,
      ...(platform === undefined ? {} : { 'filter[platform]': platform }),
    } });
  };
}
