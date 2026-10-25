import { z } from 'zod';
import type { AppleClient } from '../apple/client.js';
import { createListApps, listAppsInput } from './apps.js';
import { createGetApp, getAppInput } from './get-app.js';

/** Create handlers per connection so list cursors never cross connection boundaries. */
export function createToolRegistry(client: AppleClient) {
  const tools = [
    {
      name: 'list_apps',
      description: 'List accessible apps and identity fields. Follow nextCursor explicitly; one page is not a complete inventory.',
      input: listAppsInput,
      execute: createListApps(client),
    },
    {
      name: 'get_app',
      description: 'Read one app by its appId. Returns identity fields only; does not load versions, builds, or localizations.',
      input: getAppInput,
      execute: createGetApp(client),
    },
  ];
  return new Map(tools.map(({ input, execute, ...metadata }) => [metadata.name, {
    definition: {
      ...metadata,
      inputSchema: z.toJSONSchema(input, { io: 'input' }) as { type: 'object' },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    execute,
  }]));
}
