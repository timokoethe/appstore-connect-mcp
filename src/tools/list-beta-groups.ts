import { z } from 'zod';
import { AppleClientError, type AppleClient } from '../apple/client.js';
import { createPaginator, paginationInput, pageLinks, type PaginationOptions } from './pagination.js';
import { resourceId, ToolError } from './shared.js';

export const listBetaGroupsInput = z.strictObject({ appId: resourceId, ...paginationInput });
const responseSchema = z.object({
  data: z.array(z.object({
    id: resourceId,
    type: z.literal('betaGroups'),
    attributes: z.object({ name: z.string().nullable(), isInternalGroup: z.boolean().nullable() }),
  })).max(100),
  links: pageLinks,
});

export function createListBetaGroups(client: AppleClient, options: PaginationOptions = {}) {
  const paginate = createPaginator(async (path, query) => {
    const response = responseSchema.safeParse(await client.get(path, query));
    if (!response.success) throw new AppleClientError('upstream');
    return {
      items: response.data.data.map(({ id, attributes }) => ({ id, ...attributes })),
      next: response.data.links.next,
    };
  }, options);
  return async (input: unknown) => {
    const parsed = listBetaGroupsInput.safeParse(input);
    if (!parsed.success) throw new ToolError('invalid_input', 'Invalid list_beta_groups arguments.');
    const { appId, limit, cursor } = parsed.data;
    return paginate({ path: `/v1/apps/${encodeURIComponent(appId)}/betaGroups`, limit, cursor, query: {
      'fields[betaGroups]': 'name,isInternalGroup',
    } });
  };
}
