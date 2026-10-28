import { z } from 'zod';
import { AppleClientError, type AppleClient } from '../apple/client.js';
import { createPaginator, paginationInput, pageLinks, type PaginationOptions } from './pagination.js';
import { BUILD_FIELDS, buildResource, buildVersions, toBuild } from './build-schema.js';
import { resourceId, ToolError } from './shared.js';

export const listBuildsInput = z.strictObject({ appId: resourceId, ...paginationInput });
const responseSchema = z.object({
  data: z.array(buildResource).max(100),
  included: z.array(z.unknown()).max(100).optional(),
  links: pageLinks,
});

export function createListBuilds(client: AppleClient, options: PaginationOptions = {}) {
  const paginate = createPaginator(async (path, query) => {
    const response = responseSchema.safeParse(await client.get(path, query));
    if (!response.success) throw new AppleClientError('upstream');
    const versions = buildVersions(response.data.included);
    return {
      items: response.data.data.map((build) => toBuild(build, versions)),
      next: response.data.links.next,
    };
  }, options);
  return async (input: unknown) => {
    const parsed = listBuildsInput.safeParse(input);
    if (!parsed.success) throw new ToolError('invalid_input', 'Invalid list_builds arguments.');
    const { appId, limit, cursor } = parsed.data;
    return paginate({ path: '/v1/builds', limit, cursor, query: {
      'filter[app]': appId,
      'fields[builds]': BUILD_FIELDS,
      include: 'preReleaseVersion',
      'fields[preReleaseVersions]': 'version,platform',
      sort: '-uploadedDate',
    } });
  };
}
