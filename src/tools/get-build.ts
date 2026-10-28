import { z } from 'zod';
import { AppleClientError, type AppleClient } from '../apple/client.js';
import { BUILD_FIELDS, buildResource, buildVersions, toBuild } from './build-schema.js';
import { resourceId, ToolError } from './shared.js';

export const getBuildInput = z.strictObject({ buildId: resourceId });
const betaDetail = z.object({
  id: resourceId,
  type: z.literal('buildBetaDetails'),
  attributes: z.object({ internalBuildState: z.string().nullable(), externalBuildState: z.string().nullable() }),
});
const responseSchema = z.object({
  data: buildResource.extend({
    relationships: buildResource.shape.relationships.unwrap().extend({
      buildBetaDetail: z.object({
        data: z.object({ type: z.literal('buildBetaDetails'), id: resourceId }).nullable().optional(),
      }).optional(),
    }).optional(),
  }),
  included: z.array(z.unknown()).max(100).optional(),
});

export function createGetBuild(client: AppleClient) {
  return async (input: unknown) => {
    const parsed = getBuildInput.safeParse(input);
    if (!parsed.success) throw new ToolError('invalid_input', 'Invalid get_build arguments.');
    const { buildId } = parsed.data;
    const response = responseSchema.safeParse(await client.get(`/v1/builds/${encodeURIComponent(buildId)}`, {
      'fields[builds]': `${BUILD_FIELDS},buildBetaDetail`,
      include: 'preReleaseVersion,buildBetaDetail',
      'fields[preReleaseVersions]': 'version,platform',
      'fields[buildBetaDetails]': 'internalBuildState,externalBuildState',
    }));
    if (!response.success || response.data.data.id !== buildId) throw new AppleClientError('upstream');
    const details = new Map<string, z.infer<typeof betaDetail>>();
    for (const resource of response.data.included ?? []) {
      if (typeof resource !== 'object' || resource === null || !('type' in resource)
        || resource.type !== 'buildBetaDetails') continue;
      const detail = betaDetail.safeParse(resource);
      if (!detail.success || details.has(detail.data.id)) throw new AppleClientError('upstream');
      details.set(detail.data.id, detail.data);
    }
    const build = response.data.data;
    const buildBetaDetailId = build.relationships?.buildBetaDetail?.data?.id ?? null;
    const beta = buildBetaDetailId === null ? undefined : details.get(buildBetaDetailId);
    const internalBuildState = beta?.attributes.internalBuildState ?? null;
    const externalBuildState = beta?.attributes.externalBuildState ?? null;
    const result = { item: {
      ...toBuild(build, buildVersions(response.data.included)),
      buildBetaDetailId, internalBuildState, externalBuildState,
      betaStatusUnavailable: internalBuildState === null || externalBuildState === null,
    } };
    if (Buffer.byteLength(JSON.stringify(result)) > 32_768) {
      throw new ToolError('record_too_large', 'One build exceeds the output budget. This tool cannot retrieve that record.');
    }
    return result;
  };
}
