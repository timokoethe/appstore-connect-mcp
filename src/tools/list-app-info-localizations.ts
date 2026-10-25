import { z } from 'zod';
import { AppleClientError, type AppleClient } from '../apple/client.js';
import { createPaginator, paginationInput, pageLinks, type PaginationOptions } from './pagination.js';
import { resourceId, ToolError } from './shared.js';

export const listAppInfoLocalizationsInput = z.strictObject({ appInfoId: resourceId, ...paginationInput });
const responseSchema = z.object({
  data: z.array(z.object({
    id: resourceId,
    type: z.literal('appInfoLocalizations'),
    attributes: z.object({
      locale: z.string().nullable(),
      name: z.string().nullable(),
      subtitle: z.string().nullable(),
      privacyPolicyUrl: z.string().nullable(),
    }),
  })).max(100),
  links: pageLinks,
});

export function createListAppInfoLocalizations(client: AppleClient, options: PaginationOptions = {}) {
  const paginate = createPaginator(async (path, query) => {
    const response = responseSchema.safeParse(await client.get(path, query));
    if (!response.success) throw new AppleClientError('upstream');
    return {
      items: response.data.data.map(({ id, attributes }) => ({ id, ...attributes })),
      next: response.data.links.next,
    };
  }, options);
  return async (input: unknown) => {
    const parsed = listAppInfoLocalizationsInput.safeParse(input);
    if (!parsed.success) throw new ToolError('invalid_input', 'Invalid list_app_info_localizations arguments.');
    const { appInfoId, limit, cursor } = parsed.data;
    return paginate({ path: `/v1/appInfos/${encodeURIComponent(appInfoId)}/appInfoLocalizations`, limit, cursor, query: {
      'fields[appInfoLocalizations]': 'locale,name,subtitle,privacyPolicyUrl',
    } });
  };
}
