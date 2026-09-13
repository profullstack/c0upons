// The MCP server's protocol half, with fake tools: handshake, listing,
// calling, required-argument checks, tool failures as readable results,
// notifications, and unknown methods.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { handleMcp, PROTOCOL_VERSIONS } = await import('../apps/web/lib/mcp-protocol.ts');

const server = { name: 'c0upons', version: '9.9.9', instructions: 'be nice' };
const tools = [
  {
    name: 'echo',
    description: 'says it back',
    inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] },
    run: async ({ text }) => ({ said: text }),
  },
  {
    name: 'boom',
    description: 'fails',
    inputSchema: { type: 'object', properties: {} },
    run: async () => { throw new Error('no such store'); },
  },
];

test('initialize negotiates a version and names the server', async () => {
  const r = await handleMcp({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05' } }, tools, server);
  assert.equal(r.status, 200);
  assert.equal(r.body.result.protocolVersion, '2024-11-05');
  assert.deepEqual(r.body.result.serverInfo, { name: 'c0upons', version: '9.9.9' });
  const unknown = await handleMcp({ id: 2, method: 'initialize', params: { protocolVersion: '1999-01-01' } }, tools, server);
  assert.equal(unknown.body.result.protocolVersion, PROTOCOL_VERSIONS[0]);
});

test('notifications get 202 and no body', async () => {
  const r = await handleMcp({ jsonrpc: '2.0', method: 'notifications/initialized' }, tools, server);
  assert.deepEqual(r, { status: 202, body: null });
});

test('tools/list describes the tools without their run functions', async () => {
  const r = await handleMcp({ id: 3, method: 'tools/list' }, tools, server);
  assert.deepEqual(r.body.result.tools.map((t) => t.name), ['echo', 'boom']);
  assert.equal(r.body.result.tools[0].run, undefined);
});

test('tools/call runs a tool, checks required arguments, and reports a failure as a result', async () => {
  const ok = await handleMcp({ id: 4, method: 'tools/call', params: { name: 'echo', arguments: { text: 'hi' } } }, tools, server);
  assert.equal(ok.body.result.isError, false);
  assert.deepEqual(ok.body.result.structuredContent, { said: 'hi' });
  assert.equal(ok.body.result.content[0].type, 'text');

  const missing = await handleMcp({ id: 5, method: 'tools/call', params: { name: 'echo', arguments: {} } }, tools, server);
  assert.equal(missing.body.error.code, -32602);
  assert.match(missing.body.error.message, /needs text/);

  const failed = await handleMcp({ id: 6, method: 'tools/call', params: { name: 'boom' } }, tools, server);
  assert.equal(failed.status, 200);
  assert.equal(failed.body.result.isError, true);
  assert.equal(failed.body.result.content[0].text, 'no such store');

  const nope = await handleMcp({ id: 7, method: 'tools/call', params: { name: 'nothing' } }, tools, server);
  assert.match(nope.body.error.message, /Unknown tool/);
});

test('an unknown method and a malformed message are JSON-RPC errors', async () => {
  const r = await handleMcp({ id: 8, method: 'resources/list' }, tools, server);
  assert.equal(r.body.error.code, -32601);
  const bad = await handleMcp({ id: 9 }, tools, server);
  assert.equal(bad.status, 400);
});
