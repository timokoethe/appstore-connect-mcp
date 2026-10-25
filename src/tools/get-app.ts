import { z } from 'zod';
import { AppleClientError, type AppleClient } from '../apple/client.js';
import { APP_FIELDS, appResource, toAppIdentity } from './app-schema.js';
import { resourceId, ToolError } from './shared.js';

export const getAppInput = z.strictObject({ appId: resourceId });
const responseSchema = z.object({ data: appResource });

export function createGetApp(client: AppleClient) {
  return async (input: unknown) => {
    const parsed = getAppInput.safeParse(input);
    if (!parsed.success) throw new ToolError('invalid_input', 'Invalid get_app arguments.');
    const { appId } = parsed.data;
    const response = responseSchema.safeParse(await client.get(`/v1/apps/${encodeURIComponent(appId)}`, {
      'fields[apps]': APP_FIELDS,
    }));
    if (!response.success || response.data.data.id !== appId) throw new AppleClientError('upstream');
    const result = { item: toAppIdentity(response.data.data) };
    if (Buffer.byteLength(JSON.stringify(result)) > 32_768) {
      throw new ToolError('record_too_large', 'One app exceeds the output budget. This tool cannot retrieve that record.');
    }
    return result;
  };
}
