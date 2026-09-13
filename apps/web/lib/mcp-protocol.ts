/**
 * A stateless Model Context Protocol server, the size of what c0upons needs.
 *
 * JSON-RPC over one POST: `initialize`, `ping`, `tools/list`, `tools/call`,
 * and the `notifications/initialized` a client sends after the handshake.
 * No sessions, no resources, no prompts: the tools are reads of a public
 * coupon database plus the two keyless actions (reveal a code, sync deals),
 * so a client needs nothing but the URL. Same shape as nichedb.dev's server,
 * which the house catalog at openmcp.logicsrc.com already lists.
 *
 * Pure: the tools are handed in, so the protocol can be tested with fakes.
 */

export const PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];

export interface McpTool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties?: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  };
  run: (args: Record<string, unknown>) => Promise<unknown>;
}

export interface JsonRpcRequest {
  jsonrpc?: string;
  id?: number | string | null;
  method?: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcAnswer {
  status: number;
  body: Record<string, unknown> | null;
}

export const ERRORS = {
  PARSE: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL: -32603,
} as const;

export function fail(id: JsonRpcRequest['id'], code: number, message: string, data?: unknown) {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message, ...(data === undefined ? {} : { data }) } };
}

const ok = (id: JsonRpcRequest['id'], result: unknown) => ({ jsonrpc: '2.0', id: id ?? null, result });

export interface McpServerInfo {
  name: string;
  version: string;
  instructions: string;
}

/** Answer one JSON-RPC message. A notification (no id) gets 202 and no body. */
export async function handleMcp(
  msg: JsonRpcRequest,
  tools: McpTool[],
  server: McpServerInfo
): Promise<JsonRpcAnswer> {
  if (!msg || typeof msg !== 'object' || typeof msg.method !== 'string') {
    return { status: 400, body: fail(msg?.id, ERRORS.INVALID_REQUEST, 'Expected a JSON-RPC request with a method') };
  }
  const isNotification = msg.id === undefined;
  if (msg.method.startsWith('notifications/')) return { status: 202, body: null };

  switch (msg.method) {
    case 'initialize': {
      const asked = String(msg.params?.protocolVersion ?? '');
      const protocolVersion = PROTOCOL_VERSIONS.includes(asked) ? asked : PROTOCOL_VERSIONS[0];
      return {
        status: 200,
        body: ok(msg.id, {
          protocolVersion,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: server.name, version: server.version },
          instructions: server.instructions,
        }),
      };
    }
    case 'ping':
      return { status: 200, body: ok(msg.id, {}) };
    case 'tools/list':
      return {
        status: 200,
        body: ok(msg.id, {
          tools: tools.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })),
        }),
      };
    case 'tools/call': {
      const name = String(msg.params?.name ?? '');
      const tool = tools.find((t) => t.name === name);
      if (!tool) return { status: 200, body: fail(msg.id, ERRORS.INVALID_PARAMS, `Unknown tool: ${name}`) };
      const args = (msg.params?.arguments ?? {}) as Record<string, unknown>;
      for (const key of tool.inputSchema.required ?? []) {
        if (args[key] === undefined || args[key] === null || args[key] === '') {
          return { status: 200, body: fail(msg.id, ERRORS.INVALID_PARAMS, `${name} needs ${key}`) };
        }
      }
      try {
        const result = await tool.run(args);
        const text = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
        return {
          status: 200,
          body: ok(msg.id, {
            content: [{ type: 'text', text }],
            ...(typeof result === 'object' && result !== null ? { structuredContent: result } : {}),
            isError: false,
          }),
        };
      } catch (err) {
        // A tool that fails is a result the model can read, not a transport error.
        return {
          status: 200,
          body: ok(msg.id, {
            content: [{ type: 'text', text: (err as Error)?.message ?? String(err) }],
            isError: true,
          }),
        };
      }
    }
    default:
      if (isNotification) return { status: 202, body: null };
      return { status: 200, body: fail(msg.id, ERRORS.METHOD_NOT_FOUND, `Unknown method: ${msg.method}`) };
  }
}
