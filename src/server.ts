import { Server } from '@modelcontextprotocol/server';
import { AppleClientError, type AppleClient } from './apple/client.js';
import { createToolRegistry } from './tools/registry.js';
import { ToolError } from './tools/shared.js';

export function createServer(client: AppleClient): Server {
  const server = new Server({ name: 'appstoreconnect-mcp', version: '1.0.0' }, { capabilities: { tools: {} } });
  const tools = createToolRegistry(client);
  server.setRequestHandler('tools/list', () => ({ tools: [...tools.values()].map((tool) => tool.definition) }));
  // Validate here so SDK schema errors cannot echo caller-supplied values or keys.
  server.setRequestHandler('tools/call', async (request) => {
    try {
      const tool = tools.get(request.params.name);
      if (!tool) throw new ToolError('invalid_input', 'Unknown tool.');
      const result = await tool.execute(request.params.arguments ?? {});
      return { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result };
    } catch (error) {
      const safe = error instanceof ToolError || error instanceof AppleClientError
        ? error : new AppleClientError('upstream');
      return { isError: true, content: [{ type: 'text', text: JSON.stringify({ error: { code: safe.code, message: safe.message } }) }] };
    }
  });
  return server;
}
