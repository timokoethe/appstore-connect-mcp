import { z } from 'zod';
import { AppleClientError, type AppleClient } from '../apple/client.js';
import { createPaginator, paginationInput, pageLinks, type PaginationOptions } from './pagination.js';
import { resourceId, ToolError } from './shared.js';

export const listVersionLocalizationsInput = z.strictObject({ versionId: resourceId, ...paginationInput });
const responseSchema = z.object({
  data: z.array(z.object({
    id: resourceId,
    type: z.literal('appStoreVersionLocalizations'),
    attributes: z.object({
      locale: z.string().nullable(),
      description: z.string().nullable(),
      keywords: z.string().nullable(),
      promotionalText: z.string().nullable(),
      whatsNew: z.string().nullable(),
      supportUrl: z.string().nullable(),
      marketingUrl: z.string().nullable(),
    }),
  })).max(100),
  links: pageLinks,
});

export function createListVersionLocalizations(client: AppleClient, options: PaginationOptions = {}) {
  // Small upstream limits can yield overlapping pages here. Fetch bounded pages and slice locally.
  const paginate = createPaginator(async (path, query) => {
    const response = responseSchema.safeParse(await client.get(path, query));
    if (!response.success) throw new AppleClientError('upstream');
    return {
      items: response.data.data.map(({ id, attributes }) => ({ id, ...attributes })),
      next: response.data.links.next,
    };
  }, { ...options, upstreamPageSize: 100 });
  return async (input: unknown) => {
    const parsed = listVersionLocalizationsInput.safeParse(input);
    if (!parsed.success) throw new ToolError('invalid_input', 'Invalid list_version_localizations arguments.');
    const { versionId, limit, cursor } = parsed.data;
    return paginate({ path: `/v1/appStoreVersions/${encodeURIComponent(versionId)}/appStoreVersionLocalizations`, limit, cursor, query: {
      'fields[appStoreVersionLocalizations]': 'locale,description,keywords,promotionalText,whatsNew,supportUrl,marketingUrl',
    } });
  };
}
