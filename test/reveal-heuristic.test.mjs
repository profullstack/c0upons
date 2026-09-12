// The model-free shopper, against an Obscura that plays a deal page: a
// newsletter overlay, a "Show Code" control, and the code that appears only
// after it is clicked. Then the pages where it must say no.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { ObscuraMcpClient } = await import('../apps/web/lib/obscura-mcp.ts');
const { revealCodeHeuristic, extractCode, parseInteractive, codeControls, closeControls } = await import(
  '../apps/web/lib/reveal-heuristic.ts'
);

const ELEMENTS = `ref=e1    a                      "Sign In"
ref=e2    button                 "No thanks"
ref=e3    a                      "Add to Cart"
ref=e4    a[button]              "Show Code"
ref=e5    a                      "All Clothing Coupons"
ref=e6    a[button]              "Get Deal at Best Buy"`;

/** A page whose code appears only after "Show Code" is clicked (ref e4). */
function fakePage({ revealedBy = 'e4', visibleCode = null, blocked = false, empty = false } = {}) {
  const calls = [];
  let revealed = false;
  const fetchImpl = async (_url, init) => {
    const body = JSON.parse(init.body);
    if (body.id === undefined) return new Response('', { status: 202 });
    let result = {};
    if (body.method === 'initialize') result = { protocolVersion: '2024-11-05' };
    else if (body.method === 'tools/call') {
      const { name, arguments: args } = body.params;
      calls.push({ name, args });
      let text = 'ok';
      if (name === 'browser_navigate') text = blocked ? 'Navigated — "Just a moment..."' : `Navigated to ${args.url} — "${empty ? '' : 'Deal page'}"`;
      if (name === 'browser_interactive_elements') text = empty ? '' : ELEMENTS;
      if (name === 'browser_click' && args.ref === revealedBy) revealed = true;
      if (name === 'browser_search') {
        const code = revealed ? 'SAVE25NOW' : visibleCode;
        text = code
          ? `1 match(es). {"offset":10,"snippet":"Use coupon code ${code} at checkout for 25% off"}`
          : '2 match(es). {"offset":1,"snippet":"All Clothing Coupons  Computers"}\n{"offset":2,"snippet":"Promo Codes & Coupons  Alo Yoga"}';
      }
      if (name === 'browser_tab_list') text = 'tab id=t1 (active) https://deal.test';
      result = { content: [{ type: 'text', text }] };
    }
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, result }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  return { fetchImpl, calls };
}

test('reads a code out of prose the way the feeds write it', () => {
  assert.equal(extractCode('45% off with coupon code 4ZLBV9H8 at checkout'), '4ZLBV9H8');
  assert.equal(extractCode('Your code: SAVE20'), 'SAVE20');
  assert.equal(extractCode('Promo Codes & Coupons  Alo Yoga 15% Off'), null);
  assert.equal(extractCode('use code 20 for 20% off'), null);
  assert.equal(extractCode('no code needed'), null);
});

test('knows which controls a shopper presses and which never', () => {
  const els = parseInteractive(ELEMENTS);
  assert.equal(els.length, 6);
  assert.deepEqual(codeControls(els).map((e) => e.label), ['Show Code', 'Get Deal at Best Buy']);
  assert.deepEqual(closeControls(els).map((e) => e.label), ['No thanks']);
  assert.ok(!codeControls(els).some((e) => /cart/i.test(e.label)));
});

test('dismisses the overlay, clicks "Show Code", and reads the revealed code', async () => {
  const page = fakePage();
  const mcp = new ObscuraMcpClient('http://obscura.test/mcp', { fetch: page.fetchImpl });
  const r = await revealCodeHeuristic('https://deal.test/x', mcp);
  assert.equal(r.found, true);
  assert.equal(r.code, 'SAVE25NOW');
  assert.equal(r.method, 'clicked');
  assert.match(r.notes, /Show Code/);
  const names = page.calls.map((c) => c.name);
  assert.equal(names[0], 'browser_navigate');
  assert.ok(names.includes('browser_press_key'), 'Escape is pressed first');
  const clicks = page.calls.filter((c) => c.name === 'browser_click').map((c) => c.args.ref);
  assert.deepEqual(clicks, ['e2', 'e4'], 'the close control, then Show Code, and never the cart');
  assert.equal(names.at(-1), 'browser_close');
});

test('a code already in the text is reported without a click', async () => {
  const page = fakePage({ visibleCode: 'BQE3A8BR' });
  const mcp = new ObscuraMcpClient('http://obscura.test/mcp', { fetch: page.fetchImpl });
  const r = await revealCodeHeuristic('https://deal.test/y', mcp);
  assert.equal(r.code, 'BQE3A8BR');
  assert.equal(r.method, 'visible');
  assert.ok(!page.calls.some((c) => c.name === 'browser_click' && c.args.ref === 'e4'));
});

test('a page with nothing behind the controls is "none", and a challenge page is "blocked"', async () => {
  const none = fakePage({ revealedBy: 'never' });
  let r = await revealCodeHeuristic('https://deal.test/z', new ObscuraMcpClient('http://obscura.test/mcp', { fetch: none.fetchImpl }));
  assert.equal(r.found, false);
  assert.equal(r.method, 'none');
  assert.ok(r.clicks <= 4);
  assert.equal(none.calls.at(-1).name, 'browser_close');

  const blocked = fakePage({ blocked: true });
  r = await revealCodeHeuristic('https://deal.test/w', new ObscuraMcpClient('http://obscura.test/mcp', { fetch: blocked.fetchImpl }));
  assert.equal(r.method, 'blocked');
  assert.equal(blocked.calls.at(-1).name, 'browser_close');

  // No title and nothing to click: the page rendered nothing for the browser.
  const empty = fakePage({ empty: true });
  r = await revealCodeHeuristic('https://deal.test/v', new ObscuraMcpClient('http://obscura.test/mcp', { fetch: empty.fetchImpl }));
  assert.equal(r.method, 'blocked');
  assert.match(r.notes, /rendered nothing/);
});
