// Walk real deal pages with the model-free shopper against a running Obscura.
//   OBSCURA_MCP_URL=http://127.0.0.1:3111/mcp node scripts/reveal-smoke.mjs <url> [url...]
// Start Obscura with: obscura mcp --http --host 127.0.0.1 --port 3111 --stealth
import { ObscuraMcpClient } from '../lib/obscura-mcp.ts';
import { revealCodeHeuristic } from '../lib/reveal-heuristic.ts';

const mcp = new ObscuraMcpClient(process.env.OBSCURA_MCP_URL ?? 'http://127.0.0.1:3111/mcp');
for (const url of process.argv.slice(2)) {
  const t0 = Date.now();
  try {
    const r = await revealCodeHeuristic(url, mcp);
    console.log(`${((Date.now() - t0) / 1000).toFixed(1)}s`, JSON.stringify(r), url.slice(0, 90));
  } catch (e) {
    console.log('FAILED', e.message, url);
  }
}
