import { z } from 'zod';
import { AppleClientError, type AppleClient } from '../apple/client.js';
import { createPaginator, paginationInput, pageLinks, type PaginationOptions } from './pagination.js';
import { resourceId, ToolError } from './shared.js';

export const listBuildsInput = z.strictObject({ appId: resourceId, ...paginationInput });
const preReleaseVersion = z.object({
  id: resourceId,
  type: z.literal('preReleaseVersions'),
  attributes: z.object({ version: z.string().nullable(), platform: z.string().nullable() }),
});
const responseSchema = z.object({
  data: z.array(z.object({
    id: resourceId,
    type: z.literal('builds'),
    attributes: z.object({
      version: z.string().nullable(),
      uploadedDate: z.string().nullable(),
      processingState: z.string().nullable(),
      expirationDate: z.string().nullable(),
      expired: z.boolean().nullable(),
    }),
    // Apple may omit linkage or provide only links when related context is unavailable.
    relationships: z.object({
      preReleaseVersion: z.object({
        data: z.object({ type: z.literal('preReleaseVersions'), id: resourceId }).nullable().optional(),
      }).optional(),
    }).optional(),
  })).max(100),
  included: z.array(z.unknown()).max(100).optional(),
  links: pageLinks,
});

export function createListBuilds(client: AppleClient, options: PaginationOptions = {}) {
  const paginate = createPaginator(async (path, query) => {
    const response = responseSchema.safeParse(await client.get(path, query));
    if (!response.success) throw new AppleClientError('upstream');
    const versions = new Map<string, z.infer<typeof preReleaseVersion>>();
    for (const resource of response.data.included ?? []) {
      // Unrequested resource types are never exposed or used as version context.
      if (typeof resource !== 'object' || resource === null || !('type' in resource)
        || resource.type !== 'preReleaseVersions') continue;
      const parsed = preReleaseVersion.safeParse(resource);
      if (!parsed.success || versions.has(parsed.data.id)) throw new AppleClientError('upstream');
      versions.set(parsed.data.id, parsed.data);
    }
    return {
      items: response.data.data.map(({ id, attributes, relationships }) => {
        const preReleaseVersionId = relationships?.preReleaseVersion?.data?.id ?? null;
        const context = preReleaseVersionId === null ? undefined : versions.get(preReleaseVersionId);
        const marketingVersion = context?.attributes.version ?? null;
        const platform = context?.attributes.platform ?? null;
        return {
          id,
          buildNumber: attributes.version,
          uploadedDate: attributes.uploadedDate,
          processingState: attributes.processingState,
          expirationDate: attributes.expirationDate,
          expired: attributes.expired,
          preReleaseVersionId,
          marketingVersion,
          platform,
          contextUnavailable: marketingVersion === null || platform === null,
        };
      }),
      next: response.data.links.next,
    };
  }, options);
  return async (input: unknown) => {
    const parsed = listBuildsInput.safeParse(input);
    if (!parsed.success) throw new ToolError('invalid_input', 'Invalid list_builds arguments.');
    const { appId, limit, cursor } = parsed.data;
    return paginate({ path: '/v1/builds', limit, cursor, query: {
      'filter[app]': appId,
      'fields[builds]': 'version,uploadedDate,processingState,expirationDate,expired,preReleaseVersion',
      include: 'preReleaseVersion',
      'fields[preReleaseVersions]': 'version,platform',
      sort: '-uploadedDate',
    } });
  };
}
