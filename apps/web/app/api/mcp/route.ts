import { NextRequest, NextResponse } from 'next/server';
import { ERRORS, fail, handleMcp, type JsonRpcRequest } from '@/lib/mcp-protocol';
import { SERVER, TOOLS } from '@/lib/mcp-tools';

export const dynamic = 'force-dynamic';
// A reveal reads a page through a browser; a sweep reads three.
export const maxDuration = 180;

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, GET, OPTIONS',
  'access-control-allow-headers': 'content-type, accept, authorization, mcp-protocol-version, mcp-session-id',
  'access-control-expose-headers': 'mcp-protocol-version',
  'access-control-max-age': '86400',
  'cache-control': 'no-store',
};

const json = (status: number, body: unknown) =>
  NextResponse.json(body, { status, headers: { ...CORS, 'mcp-protocol-version': '2025-06-18' } });

/**
 * c0upons over the Model Context Protocol: `https://c0upons.com/api/mcp`
 * (also `/mcp`). Stateless JSON-RPC over POST; one message or a batch.
 * Described for catalogs at `/.well-known/openmcp.json`.
 */
export async function POST(req: NextRequest) {
  let payload: JsonRpcRequest | JsonRpcRequest[];
  try {
    payload = await req.json();
  } catch {
    return json(400, fail(null, ERRORS.PARSE, 'Invalid JSON'));
  }
  if (Array.isArray(payload)) {
    const answers = await Promise.all(payload.map((m) => handleMcp(m, TOOLS, SERVER)));
    const bodies = answers.map((a) => a.body).filter(Boolean);
    if (!bodies.length) return new NextResponse(null, { status: 202, headers: CORS });
    return json(200, bodies);
  }
  const { status, body } = await handleMcp(payload, TOOLS, SERVER);
  if (!body) return new NextResponse(null, { status, headers: CORS });
  return json(status, body);
}

export async function GET() {
  return json(405, fail(null, ERRORS.METHOD_NOT_FOUND, 'This MCP endpoint accepts POST only. Tools: ' + TOOLS.map((t) => t.name).join(', ')));
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}
