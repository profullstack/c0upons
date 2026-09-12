// The code reveal drives a browser through an MCP server and hands the
// answer to a small model; the parts that can be checked without either are
// the wire client, the code filter, and the lock that keeps two reveals off
// the same page. Node 22+ strips the TypeScript itself.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { ObscuraMcpClient, parseSseJson } = await import('../apps/web/lib/obscura-mcp.ts');
const { isPlausibleCode, withBrowserLock, BROWSER_TOOLS } = await import(
  '../apps/web/lib/reveal-code.ts'
);

/** A fake Obscura: records requests, hands out a session id, answers JSON or SSE. */
function fakeServer({ sse = false } = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ headers: init.headers, body });
    if (body.id === undefined) return new Response('', { status: 202 });
    let result;
    if (body.method === 'initialize') result = { protocolVersion: '2024-11-05', serverInfo: { name: 'fake' } };
    else if (body.method === 'tools/list') result = { tools: [{ name: 'browser_navigate', inputSchema: { type: 'object' } }] };
    else if (body.method === 'tools/call') result = { content: [{ type: 'text', text: `called ${body.params.name} ${JSON.stringify(body.params.arguments)}` }] };
    const msg = JSON.stringify({ jsonrpc: '2.0', id: body.id, result });
    const headers = { 'mcp-session-id': 'sess-1', 'content-type': sse ? 'text/event-stream' : 'application/json' };
    return new Response(sse ? `event: message\ndata: ${msg}\n\n` : msg, { status: 200, headers });
  };
  return { fetchImpl, calls };
}

test('the client initialises once, keeps the session id, and calls tools', async () => {
  const server = fakeServer();
  const client = new ObscuraMcpClient('http://obscura.test/mcp', { fetch: server.fetchImpl });
  const tools = await client.listTools();
  assert.deepEqual(tools.map((t) => t.name), ['browser_navigate']);
  const result = await client.callTool({ name: 'browser_navigate', arguments: { url: 'https://x.test' } });
  assert.equal(ObscuraMcpClient.text(result), 'called browser_navigate {"url":"https://x.test"}');
  assert.equal(result.isError, undefined);

  const methods = server.calls.map((c) => c.body.method);
  assert.deepEqual(methods, ['initialize', 'notifications/initialized', 'tools/list', 'tools/call']);
  assert.equal(server.calls[2].headers['mcp-session-id'], 'sess-1', 'the session id from initialize is sent back');
});

test('an event-stream answer is read the same as a JSON one', async () => {
  const server = fakeServer({ sse: true });
  const client = new ObscuraMcpClient('http://obscura.test/mcp', { fetch: server.fetchImpl });
  const result = await client.callTool({ name: 'browser_snapshot' });
  assert.match(ObscuraMcpClient.text(result), /^called browser_snapshot/);
  assert.equal(parseSseJson(': keepalive\n\ndata: {"jsonrpc":"2.0","id":1,"result":{"a":1}}\n\n').result.a, 1);
  assert.equal(parseSseJson('nothing'), null);
});

test('a JSON-RPC error becomes a thrown error naming the method', async () => {
  const fetchImpl = async () =>
    new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, error: { code: -32601, message: 'no such tool' } }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  const client = new ObscuraMcpClient('http://obscura.test/mcp', { fetch: fetchImpl });
  await assert.rejects(client.listTools(), /initialize: no such tool/);
});

test('a code is a checkout token, never a price, a year or a word', () => {
  for (const ok of ['SAVE20', '4ZLBV9H8', '100RV50', 'BOGO-FALL', 'dn15', ' EXTRA40 ']) assert.ok(isPlausibleCode(ok), ok);
  for (const bad of [null, '', '2026', '399', 'AT', 'FREE SHIPPING', 'a'.repeat(30), 'no code needed']) {
    assert.equal(isPlausibleCode(bad), false, String(bad));
  }
});

test('reveals queue on the one browser page, and a failure does not jam the queue', async () => {
  const order = [];
  const first = withBrowserLock(async () => {
    order.push('a-start');
    await new Promise((r) => setTimeout(r, 20));
    order.push('a-end');
    throw new Error('boom');
  }).catch((e) => e.message);
  const second = withBrowserLock(async () => {
    order.push('b');
    return 'ok';
  });
  assert.equal(await first, 'boom');
  assert.equal(await second, 'ok');
  assert.deepEqual(order, ['a-start', 'a-end', 'b']);
});

test('the shopper gets the browsing tools and none of the storage or PDF ones', () => {
  assert.ok(BROWSER_TOOLS.includes('browser_click'));
  assert.ok(BROWSER_TOOLS.includes('browser_press_key'));
  assert.ok(BROWSER_TOOLS.includes('browser_tab_switch'));
  for (const risky of ['browser_fill', 'browser_fill_form', 'browser_evaluate', 'browser_set_cookie', 'browser_pdf']) {
    assert.ok(!BROWSER_TOOLS.includes(risky), risky);
  }
});
