#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/server/stdio';
import { createTokenProvider } from './apple/auth.js';
import { createAppleClient } from './apple/client.js';
import { loadConfig } from './config.js';
import { createServer } from './server.js';

try {
  const tokens = await createTokenProvider(await loadConfig());
  const server = createServer(createAppleClient(tokens));
  await server.connect(new StdioServerTransport());
} catch {
  process.stderr.write('Unable to start App Store Connect MCP. Check configuration and signing key.\n');
  process.exitCode = 1;
}
