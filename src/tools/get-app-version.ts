import { z } from 'zod';
import { AppleClientError, type AppleClient } from '../apple/client.js';
import { resourceId, ToolError } from './shared.js';
import { VERSION_FIELDS, versionResource, toVersion } from './version-schema.js';

export const getAppVersionInput = z.strictObject({ versionId: resourceId });
const responseSchema = z.object({
  data: versionResource.extend({
    attributes: versionResource.shape.attributes.extend({ earliestReleaseDate: z.string().nullable() }),
    relationships: z.object({
      build: z.object({ data: z.object({ type: z.literal('builds'), id: resourceId }).nullable() }),
    }),
  }),
});

export function createGetAppVersion(client: AppleClient) {
  return async (input: unknown) => {
    const parsed = getAppVersionInput.safeParse(input);
    if (!parsed.success) throw new ToolError('invalid_input', 'Invalid get_app_version arguments.');
    const { versionId } = parsed.data;
    const response = responseSchema.safeParse(await client.get(`/v1/appStoreVersions/${encodeURIComponent(versionId)}`, {
      'fields[appStoreVersions]': `${VERSION_FIELDS},earliestReleaseDate,build`,
      include: 'build',
      'fields[builds]': 'version',
    }));
    if (!response.success || response.data.data.id !== versionId) throw new AppleClientError('upstream');
    const version = response.data.data;
    const result = { item: {
      ...toVersion(version),
      earliestReleaseDate: version.attributes.earliestReleaseDate,
      buildId: version.relationships.build.data?.id ?? null,
    } };
    if (Buffer.byteLength(JSON.stringify(result)) > 32_768) {
      throw new ToolError('record_too_large', 'One version exceeds the output budget. This tool cannot retrieve that record.');
    }
    return result;
  };
}
