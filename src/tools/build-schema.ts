import { z } from 'zod';
import { AppleClientError } from '../apple/client.js';
import { resourceId } from './shared.js';

export const BUILD_FIELDS = 'version,uploadedDate,processingState,expirationDate,expired,preReleaseVersion';
const preReleaseVersion = z.object({
  id: resourceId,
  type: z.literal('preReleaseVersions'),
  attributes: z.object({ version: z.string().nullable(), platform: z.string().nullable() }),
});
export const buildResource = z.object({
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
});

export function buildVersions(included: unknown[] = []) {
  const versions = new Map<string, z.infer<typeof preReleaseVersion>>();
  for (const resource of included) {
    // Unrequested resource types are never exposed or used as version context.
    if (typeof resource !== 'object' || resource === null || !('type' in resource)
      || resource.type !== 'preReleaseVersions') continue;
    const parsed = preReleaseVersion.safeParse(resource);
    if (!parsed.success || versions.has(parsed.data.id)) throw new AppleClientError('upstream');
    versions.set(parsed.data.id, parsed.data);
  }
  return versions;
}

export function toBuild({ id, attributes, relationships }: z.infer<typeof buildResource>, versions: ReturnType<typeof buildVersions>) {
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
}
