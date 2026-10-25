import { z } from 'zod';
import { resourceId } from './shared.js';

export const VERSION_FIELDS = 'versionString,platform,appVersionState,releaseType,createdDate';
// Keep upstream enum values open: new Apple states must not be mistaken for success.
export const versionResource = z.object({
  id: resourceId,
  type: z.literal('appStoreVersions'),
  attributes: z.object({
    versionString: z.string().nullable(),
    platform: z.string().nullable(),
    appVersionState: z.string().nullable(),
    releaseType: z.string().nullable(),
    createdDate: z.string().nullable(),
  }),
});

export function toVersion({ id, attributes }: z.infer<typeof versionResource>) {
  return { id, ...attributes };
}
