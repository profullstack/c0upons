import type { ObscuraMcpClient } from './obscura-mcp';

/**
 * Reveal a coupon code with no model at all: the clicks a shopper makes,
 * scripted.
 *
 * The model-driven shopper in reveal-code.ts is the better reader, but it
 * needs a model with quota, and the fleet's keys spend theirs in the first
 * days of every month. A coupon page cannot wait for October. So this is the
 * same walk with the judgement replaced by patterns: dismiss whatever covers
 * the page, click the controls that deal sites use to hide a code, follow
 * the tab that opens, and read the code out of the text with the same
 * grammar the nichedb feeds use ("code SAVE20", "coupon code: 4ZLBV9H8").
 *
 * It clicks only what looks like a code control, never a form, never a buy
 * button, and at most a handful of times. When the page simply has no code,
 * it says so, which for most price-drop deals is the truth.
 */

/** Controls that hide a code behind a click, as deal and coupon sites label them. */
export const CODE_CONTROL = /\b(show|get|reveal|see|view|copy|unlock|grab)\b[^"]{0,20}\b(code|coupon)\b|\bcoupon code\b|\bpromo code\b|\bget deal\b/i;

/** Controls that close whatever is covering the page. */
export const CLOSE_CONTROL = /\b(close|dismiss|no thanks|not now|maybe later|accept|got it|agree|continue|×|✕)\b/i;

/** Controls we never press: they buy, fill, sign in or leave for an ad. */
export const NEVER_CONTROL = /\b(add to cart|checkout|buy now|sign in|log in|register|subscribe|submit|pay|apply now|download)\b/i;

const NOT_CODES = new Set([
  'AND', 'FOR', 'FREE', 'FROM', 'HERE', 'ONLY', 'REQUIRED', 'SALE', 'SHIPPING',
  'THAT', 'THIS', 'WHEN', 'WITH', 'YOUR', 'NEEDED', 'BELOW', 'ABOVE', 'CHECKOUT',
]);
const CUE = /\b(?:promo|coupon|discount|checkout|voucher|offer|use|w\/|with)?\s*codes?\b/gi;

/**
 * The code a stretch of page text announces, or null. The nichedb extractor,
 * ported: a "code" cue, then a capitals-and-digits token that is not a word,
 * a price or a year. A copied-code box ("Your code: SAVE20") reads the same.
 */
export function extractCode(text: string): string | null {
  const s = String(text ?? '').replace(/\s+/g, ' ');
  for (const m of s.matchAll(CUE)) {
    const rest = s.slice((m.index ?? 0) + m[0].length);
    const t = rest.match(/^[\s:=\-–"'“”«]*([A-Z0-9][A-Z0-9-]{2,24})(?![a-z])/);
    if (!t) continue;
    const code = t[1].replace(/-+$/, '');
    if (code.length < 3 || NOT_CODES.has(code) || /^\d+$/.test(code)) continue;
    if (code.length < 4 && !/\d/.test(code)) continue;
    return code;
  }
  return null;
}

/** One line of `browser_interactive_elements`: `ref=e77  a[button]  "Get Deal at Best Buy"`. */
export interface InteractiveElement {
  ref: string;
  kind: string;
  label: string;
}

export function parseInteractive(text: string): InteractiveElement[] {
  const out: InteractiveElement[] = [];
  for (const line of String(text ?? '').split('\n')) {
    const m = line.match(/^ref=(e\d+)\s+(\S+)\s+"([^"]*)"/);
    if (m) out.push({ ref: m[1], kind: m[2], label: m[3].trim() });
  }
  return out;
}

/** The elements worth clicking for a code, in the order a shopper would try them. */
export function codeControls(elements: InteractiveElement[]): InteractiveElement[] {
  return elements.filter((e) => e.label && CODE_CONTROL.test(e.label) && !NEVER_CONTROL.test(e.label));
}

export function closeControls(elements: InteractiveElement[]): InteractiveElement[] {
  return elements.filter((e) => e.label && e.label.length <= 24 && CLOSE_CONTROL.test(e.label));
}

export interface HeuristicResult {
  found: boolean;
  code: string | null;
  method: 'visible' | 'clicked' | 'none' | 'blocked';
  notes: string;
  clicks: number;
}

const MAX_CLICKS = 4;

/** Read the code out of the page's search hits for "code", if any. */
async function readCode(mcp: ObscuraMcpClient): Promise<string | null> {
  const hits = await mcp.callTool({
    name: 'browser_search',
    arguments: { query: 'code', limit: 12, context_chars: 90 },
  });
  const text = hits.content.map((c) => (c.type === 'text' ? c.text : '')).join('\n');
  for (const line of text.split('\n')) {
    const snippet = line.match(/"snippet":"((?:[^"\\]|\\.)*)"/)?.[1] ?? line;
    const code = extractCode(snippet.replace(/\\"/g, '"'));
    if (code) return code;
  }
  return null;
}

async function elements(mcp: ObscuraMcpClient): Promise<InteractiveElement[]> {
  const r = await mcp.callTool({ name: 'browser_interactive_elements', arguments: { limit: 300 } });
  return parseInteractive(r.content.map((c) => (c.type === 'text' ? c.text : '')).join('\n'));
}

/** Newest tab first, so a "Get code" that opened the store is where we look next. */
async function switchToNewestTab(mcp: ObscuraMcpClient): Promise<boolean> {
  const r = await mcp.callTool({ name: 'browser_tab_list' }).catch(() => null);
  if (!r) return false;
  const text = r.content.map((c) => (c.type === 'text' ? c.text : '')).join('\n');
  const ids = [...text.matchAll(/\b(?:id|tab)[=:]\s*"?([A-Za-z0-9_-]+)"?/g)].map((m) => m[1]);
  if (ids.length < 2) return false;
  await mcp.callTool({ name: 'browser_tab_switch', arguments: { id: ids[ids.length - 1] } }).catch(() => undefined);
  return true;
}

/** Walk one deal page the way a shopper would, without a model. */
export async function revealCodeHeuristic(url: string, mcp: ObscuraMcpClient): Promise<HeuristicResult> {
  let clicks = 0;
  try {
    const nav = await mcp.callTool({ name: 'browser_navigate', arguments: { url, waitUntil: 'load' } });
    const navText = nav.content.map((c) => (c.type === 'text' ? c.text : '')).join(' ');
    if (nav.isError || /\b(403|429|access denied|just a moment|captcha)\b/i.test(navText)) {
      return { found: false, code: null, method: 'blocked', notes: navText.slice(0, 160), clicks };
    }

    // Anything covering the page goes first: Escape, then a close control.
    await mcp.callTool({ name: 'browser_press_key', arguments: { key: 'Escape' } }).catch(() => undefined);
    let els = await elements(mcp);
    // A page with no title and nothing to click rendered nothing for us:
    // Slickdeals' promo-code listings do this. That is a block, not an absence.
    if (!els.length && /—\s*""\s*$/.test(navText.trim())) {
      return { found: false, code: null, method: 'blocked', notes: 'the page rendered nothing', clicks };
    }
    for (const c of closeControls(els).slice(0, 1)) {
      await mcp.callTool({ name: 'browser_click', arguments: { ref: c.ref } }).catch(() => undefined);
      clicks++;
    }

    const visible = await readCode(mcp);
    if (visible) return { found: true, code: visible, method: 'visible', notes: 'in the page text', clicks };

    // Then the controls that hide a code, one at a time, reading after each.
    els = await elements(mcp);
    const tried = new Set<string>();
    for (const control of codeControls(els)) {
      if (clicks >= MAX_CLICKS) break;
      if (tried.has(control.label)) continue;
      tried.add(control.label);
      const r = await mcp.callTool({ name: 'browser_click', arguments: { ref: control.ref } }).catch(() => null);
      clicks++;
      if (!r || r.isError) continue;
      await mcp.callTool({ name: 'browser_wait_for_text', arguments: { text: 'code', timeout: 4 } }).catch(() => undefined);
      let code = await readCode(mcp);
      if (!code && (await switchToNewestTab(mcp))) code = await readCode(mcp);
      if (code) return { found: true, code, method: 'clicked', notes: `after "${control.label}"`, clicks };
    }
    return { found: false, code: null, method: 'none', notes: clicks ? `no code after ${clicks} click(s)` : 'no code on the page', clicks };
  } finally {
    await mcp.callTool({ name: 'browser_close' }).catch(() => undefined);
  }
}
