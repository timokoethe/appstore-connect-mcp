import { Server } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { AppleClientError, type AppleClient } from './apple/client.js';
import { AppsError, createListApps, listAppsInput } from './tools/apps.js';

export function createServer(client: AppleClient): Server {
  const server = new Server({ name: 'appstore-connect-mcp', version: '1.0.0' }, { capabilities: { tools: {} } });
  const listApps = createListApps(client);
  server.setRequestHandler('tools/list', () => ({ tools: [{
    name: 'list_apps',
    description: 'List accessible apps and identity fields. Follow nextCursor explicitly; one page is not a complete inventory.',
    inputSchema: z.toJSONSchema(listAppsInput, { io: 'input' }) as { type: 'object' },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  }] }));
  // Validate here so SDK schema errors cannot echo caller-supplied values or keys.
  server.setRequestHandler('tools/call', async (request) => {
    try {
      if (request.params.name !== 'list_apps') throw new AppsError('invalid_input');
      const result = await listApps(request.params.arguments ?? {});
      return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result };
    } catch (error) {
      const safe = error instanceof AppsError || error instanceof AppleClientError
        ? error : new AppleClientError('upstream');
      return { isError: true, content: [{ type: 'text', text: JSON.stringify({ error: { code: safe.code, message: safe.message } }) }] };
    }
  });
  return server;
}
