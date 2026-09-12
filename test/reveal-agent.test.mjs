// The shopper agent end to end, with both ends faked: a Claude API that
// scripts the tool calls a real model would make (navigate, search, report)
// and an Obscura MCP that answers them. This proves the wiring the org's
// usage cap keeps us from proving live: the SDK tool runner is handed the
// MCP tools plus report_result, tool results flow back, the report is
// validated, and the browser page is closed whatever happens.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../apps/web/package.json', import.meta.url));
const { default: Anthropic } = await import(require.resolve('@anthropic-ai/sdk'));
const { ObscuraMcpClient } = await import('../apps/web/lib/obscura-mcp.ts');
const { revealCode } = await import('../apps/web/lib/reveal-code.ts');

const OBSCURA_TOOLS = [
  'browser_navigate', 'browser_snapshot', 'browser_search', 'browser_click', 'browser_press_key',
  'browser_interactive_elements', 'browser_tab_list', 'browser_close', 'browser_pdf', 'browser_fill',
];

/** An Obscura that remembers what was asked of it. */
function fakeMcp(pageText) {
  const calls = [];
  const fetchImpl = async (_url, init) => {
    const body = JSON.parse(init.body);
    if (body.id === undefined) return new Response('', { status: 202 });
    let result;
    if (body.method === 'initialize') result = { protocolVersion: '2024-11-05' };
    else if (body.method === 'tools/list') {
      result = { tools: OBSCURA_TOOLS.map((name) => ({ name, description: name, inputSchema: { type: 'object', properties: { url: { type: 'string' }, query: { type: 'string' } } } })) };
    } else if (body.method === 'tools/call') {
      calls.push(body.params);
      const text = body.params.name === 'browser_search' ? pageText : `ok ${body.params.name}`;
      result = { content: [{ type: 'text', text }] };
    }
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, result }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  return { fetchImpl, calls };
}

/**
 * A Claude API that plays a scripted shopper. Each turn it looks at the last
 * tool result to decide the next tool call, the way a model would.
 */
function fakeClaude(script) {
  const requests = [];
  const server = createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      const body = JSON.parse(raw);
      requests.push(body);
      const step = script(body, requests.length);
      const content = step.tool
        ? [{ type: 'tool_use', id: `toolu_${requests.length}`, name: step.tool, input: step.input ?? {} }]
        : [{ type: 'text', text: step.text ?? 'done' }];
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        id: `msg_${requests.length}`, type: 'message', role: 'assistant', model: body.model, content,
        stop_reason: step.tool ? 'tool_use' : 'end_turn', stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 5 },
      }));
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, requests, port: server.address().port })));
}

function lastToolResult(body) {
  const last = body.messages[body.messages.length - 1];
  if (last.role !== 'user' || !Array.isArray(last.content)) return null;
  const block = last.content.find((b) => b.type === 'tool_result');
  if (!block) return null;
  const text = Array.isArray(block.content) ? block.content.map((c) => c.text ?? '').join('') : String(block.content ?? '');
  return { id: block.tool_use_id, text };
}

test('the shopper navigates, reads, reports a code, and the page is closed', async () => {
  const mcp = fakeMcp('1 match(es). "45% off with coupon code 4ZLBV9H8 at checkout"');
  const claude = await fakeClaude((body, n) => {
    const r = lastToolResult(body);
    if (!r) return { tool: 'browser_navigate', input: { url: 'https://deal.test/x' } };
    if (r.text.startsWith('ok browser_navigate')) return { tool: 'browser_search', input: { query: 'code' } };
    if (/coupon code/.test(r.text)) return { tool: 'report_result', input: { found: true, code: '4zlbv9h8', method: 'visible', notes: 'in the deal text' } };
    return { text: 'Reported.' };
  });
  try {
    const client = new ObscuraMcpClient('http://obscura.test/mcp', { fetch: mcp.fetchImpl });
    const anthropic = new Anthropic({ apiKey: 'test', baseURL: `http://127.0.0.1:${claude.port}`, maxRetries: 0 });
    const result = await revealCode({ url: 'https://deal.test/x', title: 'Survival kit $18' }, { mcp: client, anthropic, model: 'claude-haiku-4-5' });

    assert.equal(result.found, true);
    assert.equal(result.code, '4ZLBV9H8', 'the code is normalised to upper case');
    assert.equal(result.method, 'visible');
    assert.equal(result.notes, 'in the deal text');

    const first = claude.requests[0];
    const toolNames = first.tools.map((t) => t.name);
    assert.ok(toolNames.includes('browser_click') && toolNames.includes('report_result'));
    assert.ok(!toolNames.includes('browser_fill') && !toolNames.includes('browser_pdf'), 'risky tools are not offered');
    assert.equal(first.model, 'claude-haiku-4-5');
    assert.match(first.system, /report_result exactly once/);

    assert.deepEqual(mcp.calls.map((c) => c.name), ['browser_navigate', 'browser_search', 'browser_close']);
    assert.deepEqual(mcp.calls[0].arguments, { url: 'https://deal.test/x' });
  } finally {
    claude.server.close();
  }
});

test('a report of no code, or an implausible one, is a clean "none"', async () => {
  const mcp = fakeMcp('0 match(es).');
  const claude = await fakeClaude((body) => {
    const r = lastToolResult(body);
    if (!r) return { tool: 'browser_navigate', input: { url: 'https://deal.test/y' } };
    if (r.text.startsWith('ok browser_navigate')) return { tool: 'report_result', input: { found: true, code: '2026', method: 'visible', notes: 'a year, not a code' } };
    return { text: 'Reported.' };
  });
  try {
    const client = new ObscuraMcpClient('http://obscura.test/mcp', { fetch: mcp.fetchImpl });
    const anthropic = new Anthropic({ apiKey: 'test', baseURL: `http://127.0.0.1:${claude.port}`, maxRetries: 0 });
    const result = await revealCode({ url: 'https://deal.test/y', title: 'Trade-in deal' }, { mcp: client, anthropic });
    assert.equal(result.found, false);
    assert.equal(result.code, null);
    assert.equal(result.method, 'none');
    assert.equal(mcp.calls.at(-1).name, 'browser_close');
  } finally {
    claude.server.close();
  }
});

test('a model that never reports is not a code, and the page is still closed', async () => {
  const mcp = fakeMcp('');
  const claude = await fakeClaude(() => ({ text: 'I could not do it.' }));
  try {
    const client = new ObscuraMcpClient('http://obscura.test/mcp', { fetch: mcp.fetchImpl });
    const anthropic = new Anthropic({ apiKey: 'test', baseURL: `http://127.0.0.1:${claude.port}`, maxRetries: 0 });
    const result = await revealCode({ url: 'https://deal.test/z', title: 'x' }, { mcp: client, anthropic });
    assert.equal(result.code, null);
    assert.match(result.notes, /did not report/);
    assert.deepEqual(mcp.calls.map((c) => c.name), ['browser_close']);
  } finally {
    claude.server.close();
  }
});
