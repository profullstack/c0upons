/**
 * A client for Obscura's MCP server over HTTP.
 *
 * Obscura (github.com/h4ckf0r0day/obscura) is the stealth headless browser the
 * fleet uses to read pages that refuse a plain fetch. `obscura mcp --http`
 * serves its browser as Model Context Protocol tools: navigate, snapshot,
 * click an element by the ref a snapshot gave it, press a key, switch tabs.
 * That is a browser a model can drive, which is what revealing a coupon code
 * takes when the code sits behind a "Show code" button or a modal.
 *
 * This is the whole protocol we need: JSON-RPC over POST, an `initialize`
 * handshake, `tools/list` and `tools/call`. Streamable-HTTP servers may answer
 * as text/event-stream and may hand out an `mcp-session-id` header; both are
 * handled so the same client speaks to Obscura 0.2.2 and to whatever the
 * hosted relay runs. The shape of `callTool`'s answer matches the Anthropic
 * SDK's `MCPClientLike`, so `mcpTools()` can hand these tools to a tool runner
 * without an adapter in between.
 *
 * The server keeps one page per session, so callers that share a client must
 * not interleave two browsing tasks; see `withBrowserLock` in reveal-code.ts.
 */

import type {
  MCPCallToolResultLike,
  MCPToolResultContentLike,
} from '@anthropic-ai/sdk/helpers/beta/mcp';

export interface McpToolDef {
  name: string;
  description?: string;
  inputSchema: {
    type: 'object';
    properties?: Record<string, unknown> | null;
    required?: string[] | null;
    [k: string]: unknown;
  };
}

/*
 * The result shapes are the SDK's own, so `mcpTools()` accepts this client
 * as-is: the SDK matches structurally and a locally declared twin would have
 * to be kept identical by hand.
 */
export type McpContent = MCPToolResultContentLike;
export type McpCallResult = MCPCallToolResultLike;

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id?: number | string | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

export interface ObscuraMcpOptions {
  fetch?: typeof fetch;
  timeoutMs?: number;
}

/** Pull the last JSON-RPC message out of a text/event-stream body. */
export function parseSseJson(body: string): JsonRpcResponse | null {
  let last: JsonRpcResponse | null = null;
  for (const line of body.split(/\r?\n/)) {
    if (!line.startsWith('data:')) continue;
    const text = line.slice(5).trim();
    if (!text) continue;
    try {
      last = JSON.parse(text) as JsonRpcResponse;
    } catch {
      /* a keepalive or a partial frame; keep the last good one */
    }
  }
  return last;
}

export class ObscuraMcpClient {
  private readonly url: string;
  private readonly doFetch: typeof fetch;
  private readonly timeoutMs: number;
  private sessionId: string | null = null;
  private nextId = 1;
  private initialised: Promise<void> | null = null;

  constructor(url: string, opts: ObscuraMcpOptions = {}) {
    this.url = url;
    this.doFetch = opts.fetch ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? 90_000;
  }

  private async rpc(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    const id = this.nextId++;
    const headers: Record<string, string> = {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
    };
    if (this.sessionId) headers['mcp-session-id'] = this.sessionId;
    const res = await this.doFetch(this.url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    const session = res.headers.get('mcp-session-id');
    if (session) this.sessionId = session;
    if (!res.ok) throw new Error(`Obscura MCP answered ${res.status} to ${method}`);
    const text = await res.text();
    const type = res.headers.get('content-type') ?? '';
    const msg = type.includes('text/event-stream')
      ? parseSseJson(text)
      : (JSON.parse(text) as JsonRpcResponse);
    if (!msg) throw new Error(`Obscura MCP sent no JSON-RPC message for ${method}`);
    if (msg.error) throw new Error(`Obscura MCP ${method}: ${msg.error.message}`);
    return msg.result;
  }

  private async notify(method: string, params: Record<string, unknown> = {}): Promise<void> {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (this.sessionId) headers['mcp-session-id'] = this.sessionId;
    try {
      await this.doFetch(this.url, {
        method: 'POST',
        headers,
        body: JSON.stringify({ jsonrpc: '2.0', method, params }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      /* a notification has no answer, and a server that dislikes it still works */
    }
  }

  /** The handshake, once per client. */
  init(): Promise<void> {
    if (!this.initialised) {
      this.initialised = (async () => {
        await this.rpc('initialize', {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'c0upons', version: '1' },
        });
        await this.notify('notifications/initialized');
      })().catch((err) => {
        this.initialised = null;
        throw err;
      });
    }
    return this.initialised;
  }

  async listTools(): Promise<McpToolDef[]> {
    await this.init();
    const result = (await this.rpc('tools/list')) as { tools?: McpToolDef[] };
    return Array.isArray(result?.tools) ? result.tools : [];
  }

  /** The signature the Anthropic SDK's `MCPClientLike` expects. */
  async callTool(params: {
    name: string;
    arguments?: Record<string, unknown>;
  }): Promise<McpCallResult> {
    await this.init();
    const result = (await this.rpc('tools/call', {
      name: params.name,
      arguments: params.arguments ?? {},
    })) as McpCallResult;
    return {
      content: Array.isArray(result?.content) ? result.content : [],
      structuredContent: result?.structuredContent,
      isError: result?.isError,
    };
  }

  /** Text of a tool result, for callers that want a string. */
  static text(result: McpCallResult): string {
    return result.content
      .map((c) => (c.type === 'text' ? c.text : `[${c.type}]`))
      .join('\n');
  }
}
