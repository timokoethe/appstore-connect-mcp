import { z } from 'zod';
import type { AppleClient } from '../apple/client.js';
import { createListApps, listAppsInput } from './apps.js';
import { createGetApp, getAppInput } from './get-app.js';
import { createListAppVersions, listAppVersionsInput } from './list-app-versions.js';
import { createGetAppVersion, getAppVersionInput } from './get-app-version.js';

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
    {
      name: 'list_app_versions',
      description: 'List store versions and release states for one app, optionally filtered by platform. Follow nextCursor explicitly; do not infer the latest version across platforms.',
      input: listAppVersionsInput,
      execute: createListAppVersions(client),
    },
    {
      name: 'get_app_version',
      description: 'Read one store version by versionId, including its release state, earliest release date, and selected build ID or null. Does not return review credentials or contact details.',
      input: getAppVersionInput,
      execute: createGetAppVersion(client),
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
