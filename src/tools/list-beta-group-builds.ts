import { z } from 'zod';
import { AppleClientError, type AppleClient } from '../apple/client.js';
import { createPaginator, paginationInput, pageLinks, type PaginationOptions } from './pagination.js';
import { BUILD_FIELDS, buildResource, toBuild } from './build-schema.js';
import { resourceId, ToolError } from './shared.js';

export const listBetaGroupBuildsInput = z.strictObject({ betaGroupId: resourceId, ...paginationInput });
const responseSchema = z.object({
  data: z.array(buildResource).max(100),
  links: pageLinks,
});

export function createListBetaGroupBuilds(client: AppleClient, options: PaginationOptions = {}) {
  const paginate = createPaginator(async (path, query) => {
    const response = responseSchema.safeParse(await client.get(path, query));
    if (!response.success) throw new AppleClientError('upstream');
    const versions = new Map();
    return {
      items: response.data.data.map((build) => toBuild(build, versions)),
      next: response.data.links.next,
    };
  }, options);
  return async (input: unknown) => {
    const parsed = listBetaGroupBuildsInput.safeParse(input);
    if (!parsed.success) throw new ToolError('invalid_input', 'Invalid list_beta_group_builds arguments.');
    const { betaGroupId, limit, cursor } = parsed.data;
    return paginate({ path: `/v1/betaGroups/${encodeURIComponent(betaGroupId)}/builds`, limit, cursor, query: {
      'fields[builds]': BUILD_FIELDS,
    } });
  };
}
