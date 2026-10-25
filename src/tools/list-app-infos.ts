import { z } from 'zod';
import { AppleClientError, type AppleClient } from '../apple/client.js';
import { createPaginator, paginationInput, pageLinks, type PaginationOptions } from './pagination.js';
import { resourceId, ToolError } from './shared.js';

export const listAppInfosInput = z.strictObject({ appId: resourceId, ...paginationInput });
const responseSchema = z.object({
  data: z.array(z.object({
    id: resourceId,
    type: z.literal('appInfos'),
    // Preserve new Apple states rather than guessing whether a record is live or editable.
    attributes: z.object({ state: z.string().nullable() }),
  })).max(100),
  links: pageLinks,
});

export function createListAppInfos(client: AppleClient, options: PaginationOptions = {}) {
  const paginate = createPaginator(async (path, query) => {
    const response = responseSchema.safeParse(await client.get(path, query));
    if (!response.success) throw new AppleClientError('upstream');
    return {
      items: response.data.data.map(({ id, attributes }) => ({ id, ...attributes })),
      next: response.data.links.next,
    };
  }, options);
  return async (input: unknown) => {
    const parsed = listAppInfosInput.safeParse(input);
    if (!parsed.success) throw new ToolError('invalid_input', 'Invalid list_app_infos arguments.');
    const { appId, limit, cursor } = parsed.data;
    return paginate({ path: `/v1/apps/${encodeURIComponent(appId)}/appInfos`, limit, cursor, query: {
      'fields[appInfos]': 'state',
    } });
  };
}
