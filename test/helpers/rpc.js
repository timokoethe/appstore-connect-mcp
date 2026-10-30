import { createInterface } from 'node:readline';

// Minimal JSON-RPC client shared by in-memory and real stdio smoke tests.
export function rpc(input, output) {
  let id = 0;
  const pending = new Map();
  const lines = createInterface({ input: output });
  let protocolError = false;
  lines.on('line', (line) => {
    try {
      const message = JSON.parse(line);
      if (message.jsonrpc !== '2.0') throw new Error();
      if (message.id !== undefined) pending.get(message.id)?.(message);
    } catch { protocolError = true; }
  });
  return {
    async request(method, params = {}) {
      const requestId = ++id;
      const response = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => { pending.delete(requestId); reject(new Error('MCP request timed out')); }, 45_000);
        pending.set(requestId, (message) => { clearTimeout(timer); pending.delete(requestId); resolve(message); });
        input.write(JSON.stringify({ jsonrpc: '2.0', id: requestId, method, params }) + '\n');
      });
      if (protocolError || response.error) throw new Error('MCP protocol failure');
      return response.result;
    },
    async initialize() {
      const result = await this.request('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test', version: '1' } });
      input.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
      return result;
    },
    close() { lines.close(); },
    get protocolError() { return protocolError; },
  };
}
