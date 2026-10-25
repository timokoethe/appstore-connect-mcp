import { z } from 'zod';
import { resourceId } from './shared.js';

export const APP_FIELDS = 'name,bundleId,sku,primaryLocale';
const attributes = z.object({
  name: z.string().nullable(), bundleId: z.string().nullable(),
  sku: z.string().nullable(), primaryLocale: z.string().nullable(),
});
export const appResource = z.object({ id: resourceId, type: z.literal('apps'), attributes });
export type AppIdentity = z.infer<typeof attributes> & { id: string };

export function toAppIdentity({ id, attributes }: z.infer<typeof appResource>): AppIdentity {
  return { id, ...attributes };
}
