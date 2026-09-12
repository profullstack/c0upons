import Anthropic from '@anthropic-ai/sdk';
import { betaTool } from '@anthropic-ai/sdk/helpers/beta/json-schema';
import { mcpTools } from '@anthropic-ai/sdk/helpers/beta/mcp';
// Type-only on purpose: Node's type stripping runs this file in the tests and
// cannot resolve an extension-less sibling import, but it erases this line.
import type { ObscuraMcpClient } from './obscura-mcp';

/**
 * Find the coupon code a deal page is hiding, the way a shopper would.
 *
 * Most of the rows nichedb hands us have no code because the deal genuinely has
 * none: a price drop, a trade-in, a sale. But some pages keep the code behind
 * a "Show code" or "Get deal" control, a modal, a cookie wall, or a second tab
 * that opens on the store. Reading the HTML never sees those. So this hands a
 * real browser (Obscura, over MCP) to a small model and lets it click.
 *
 * WHY A MODEL AND NOT A SCRIPT
 *
 * Every deal site lays its page out differently and changes it without notice.
 * A selector list rots; a model reading "ref=e77 a[button] Get Deal at Best
 * Buy" does not. The model is the cheap one (Claude Haiku 4.5): the task is a
 * dozen tool calls over short snapshots, and the answer is a short string.
 *
 * WHAT IT MAY NOT DO
 *
 * It only reads and clicks. It never fills a form, never signs in, never buys.
 * It may follow the deal's own outbound button once, because that is where a
 * code is applied or shown. It reports through one tool, `report_result`, so
 * the answer is a validated object and not prose to parse.
 */

export const REVEAL_MODEL = 'claude-haiku-4-5';

/** The Obscura tools a shopper needs; the other twenty-odd stay out of the prompt. */
export const BROWSER_TOOLS = [
  'browser_navigate',
  'browser_snapshot',
  'browser_markdown',
  'browser_search',
  'browser_interactive_elements',
  'browser_click',
  'browser_press_key',
  'browser_scroll',
  'browser_wait_for_text',
  'browser_tab_list',
  'browser_tab_switch',
  'browser_back',
];

export const MAX_ITERATIONS = 14;

export interface RevealInput {
  url: string;
  title: string;
  store?: string | null;
}

export interface RevealResult {
  found: boolean;
  code: string | null;
  method: 'visible' | 'clicked' | 'none' | 'blocked';
  notes: string;
  iterations: number;
}

/**
 * What a code looks like once it is typed at a checkout: letters, digits and
 * the odd hyphen, three to twenty-five long, not a bare number, which is a
 * price or a year that got picked up. Case is normalised because sites shout.
 */
export function isPlausibleCode(s: unknown): s is string {
  if (typeof s !== 'string') return false;
  const code = s.trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9-]{2,24}$/.test(code)) return false;
  if (/^\d+$/.test(code)) return false;
  if (code.length < 4 && !/\d/.test(code)) return false;
  return true;
}

const SYSTEM = `You are helping a coupon site confirm the promo code for one deal.
You control a real web browser through tools. Behave like a careful shopper.

Procedure:
1. browser_navigate to the deal page. Then browser_search for "code" and "coupon", and browser_snapshot to read the deal itself (ignore site navigation, menus, footers and lists of other deals).
2. If a cookie wall, newsletter popup or modal covers the page, dismiss it: browser_press_key Escape, or browser_interactive_elements and browser_click its close control.
3. If the deal's own text shows a code, you are done.
4. If the deal has a control like "Show code", "Get code", "Reveal", "Copy code", "Get deal", "Buy now" or "Shop now", click it once. It may open a modal with the code, or a new tab on the store: check browser_tab_list and browser_tab_switch to the newest tab, then browser_search for "code" there. A code applied in the store's cart also counts.
5. Do not fill forms, sign in, add to cart, or click anything unrelated to this deal. Do not follow ads or other deals. At most twelve tool calls.

Then call report_result exactly once. A code is a short token a shopper types at checkout (letters and digits, sometimes a hyphen). If the page says no code is needed, or nothing reveals one, report found=false with method "none". If the site blocks the browser, report method "blocked". Never invent a code.`;

const REPORT_SCHEMA = {
  type: 'object',
  properties: {
    found: { type: 'boolean', description: 'true only when a real code was seen on the page or on the store.' },
    code: {
      type: ['string', 'null'],
      description: 'The code exactly as shown, or null.',
    },
    method: {
      type: 'string',
      enum: ['visible', 'clicked', 'none', 'blocked'],
      description: 'visible: in the deal text; clicked: revealed by a click; none: no code; blocked: the site refused the browser.',
    },
    notes: { type: 'string', description: 'One sentence on what you saw.' },
  },
  required: ['found', 'code', 'method', 'notes'],
  additionalProperties: false,
} as const;

export interface RevealDeps {
  mcp: ObscuraMcpClient;
  anthropic: Anthropic;
  model?: string;
  maxIterations?: number;
}

/** Run the shopper agent over one deal page. */
export async function revealCode(input: RevealInput, deps: RevealDeps): Promise<RevealResult> {
  const { mcp, anthropic } = deps;
  const defs = (await mcp.listTools()).filter((t) => BROWSER_TOOLS.includes(t.name));
  if (!defs.length) throw new Error('Obscura MCP exposes none of the browser tools');

  // A holder rather than a bare `let`: the tool's run() assigns it from inside
  // a closure, which TypeScript's flow analysis cannot see.
  const state: { report: Omit<RevealResult, 'iterations'> | null } = { report: null };
  const reportTool = betaTool({
    name: 'report_result',
    description: 'Report the outcome. Call it exactly once, as your last action.',
    inputSchema: REPORT_SCHEMA,
    run: (args) => {
      state.report = {
        found: Boolean(args.found),
        code: typeof args.code === 'string' ? args.code : null,
        method: args.method,
        notes: String(args.notes ?? ''),
      };
      return 'recorded';
    },
  });

  const tools = [...mcpTools(defs, mcp), reportTool];
  let iterations = 0;
  try {
    const runner = anthropic.beta.messages.toolRunner({
      model: deps.model ?? REVEAL_MODEL,
      max_tokens: 2048,
      max_iterations: deps.maxIterations ?? MAX_ITERATIONS,
      system: SYSTEM,
      tools,
      messages: [
        {
          role: 'user',
          content:
            `Deal: ${input.title}\n` +
            (input.store ? `Store: ${input.store}\n` : '') +
            `Page: ${input.url}\n\n` +
            'Find the promo code for this deal, clicking whatever a shopper would, then call report_result.',
        },
      ],
    });
    for await (const message of runner) {
      iterations++;
      void message;
    }
  } finally {
    // One page per session: leave it clean for the next deal.
    await mcp.callTool({ name: 'browser_close' }).catch(() => undefined);
  }

  const r = state.report;
  if (!r) return { found: false, code: null, method: 'none', notes: 'the agent did not report', iterations };
  const code = r.found && isPlausibleCode(r.code) ? r.code.trim().toUpperCase() : null;
  return {
    found: code !== null,
    code,
    method: code ? r.method : r.method === 'blocked' ? 'blocked' : 'none',
    notes: r.notes,
    iterations,
  };
}

/*
 * The browser is one page. Two reveals at once would click on each other's
 * tabs, so they queue here. A Railway service is one process, which is what
 * makes a module-level chain enough.
 */
let chain: Promise<unknown> = Promise.resolve();

export function withBrowserLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.catch(() => undefined);
  return run;
}
