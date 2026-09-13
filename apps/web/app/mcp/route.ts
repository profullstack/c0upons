// `/mcp` is the same server as `/api/mcp`; catalogs and clients expect the
// short path. Next reads a route's config statically, so the config lines are
// written here rather than re-exported, and only the handlers are shared.
export { POST, GET, OPTIONS } from '../api/mcp/route';

export const dynamic = 'force-dynamic';
export const maxDuration = 180;
