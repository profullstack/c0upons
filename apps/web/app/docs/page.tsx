import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Docs — c0upons',
  description: 'Documentation for the c0upons CLI and REST API.',
};

function Code({ children }: { children: React.ReactNode }) {
  return (
    <pre className="bg-gray-900 text-gray-100 rounded-lg px-4 py-3.5 text-sm font-mono leading-relaxed overflow-x-auto">
      <code>{children}</code>
    </pre>
  );
}

function IC({ children }: { children: React.ReactNode }) {
  return (
    <code className="bg-gray-100 text-orange-600 text-[13px] font-mono px-1.5 py-0.5 rounded">
      {children}
    </code>
  );
}

function Method({ verb }: { verb: string }) {
  const colors: Record<string, string> = {
    GET: 'bg-blue-50 text-blue-700 border-blue-200',
    POST: 'bg-green-50 text-green-700 border-green-200',
  };
  return (
    <span className={`inline-block border text-xs font-bold px-2 py-0.5 rounded font-mono ${colors[verb] ?? 'bg-gray-100 text-gray-700 border-gray-200'}`}>
      {verb}
    </span>
  );
}

function Endpoint({ method, path, desc, example, response }: {
  method: string;
  path: string;
  desc: string;
  example: string;
  response?: string;
}) {
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <div className="bg-gray-50 px-4 py-3 flex items-center gap-3 border-b border-gray-200">
        <Method verb={method} />
        <IC>{path}</IC>
      </div>
      <div className="p-4 flex flex-col gap-3">
        <p className="text-sm text-gray-600">{desc}</p>
        <Code>{example}</Code>
        {response && (
          <>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Response</p>
            <Code>{response}</Code>
          </>
        )}
      </div>
    </div>
  );
}

const CLI_COMMANDS = [
  {
    cmd: 'c0upons search <query>',
    desc: 'Search for coupons by store name, code, or title.',
    example: 'c0upons search nike\nc0upons search "20% off"',
  },
  {
    cmd: 'c0upons latest',
    desc: 'Show the most recent/trending coupons.',
    example: 'c0upons latest',
  },
  {
    cmd: 'c0upons stores',
    desc: 'List all stores with active coupons.',
    example: 'c0upons stores',
  },
  {
    cmd: 'c0upons store <slug>',
    desc: 'Show all coupons for a specific store.',
    example: 'c0upons store adidas\nc0upons store nike',
  },
  {
    cmd: 'c0upons reveal <id>',
    desc: 'Read a coupon\'s deal page with a real browser, click what a shopper would, and print the code it finds. Takes up to a minute.',
    example: 'c0upons reveal 67',
  },
  {
    cmd: 'c0upons sync',
    desc: 'Pull the next deals from nichedb.dev, then read the deal pages of a few coupons that have no code yet.',
    example: 'c0upons sync',
  },
  {
    cmd: 'c0upons upgrade',
    desc: 'Upgrade the CLI to the latest version. Alias: update',
    example: 'c0upons upgrade\nc0upons update',
  },
  {
    cmd: 'c0upons remove',
    desc: 'Uninstall the CLI from your system. Alias: uninstall',
    example: 'c0upons remove\nc0upons uninstall',
  },
  {
    cmd: 'c0upons version',
    desc: 'Print the installed CLI version.',
    example: 'c0upons version',
  },
];

const nav = [
  { href: '#overview', label: 'Overview', sub: false },
  { href: '#cli', label: 'CLI', sub: false },
  { href: '#cli-install', label: 'Installation', sub: true },
  { href: '#cli-commands', label: 'Commands', sub: true },
  { href: '#api', label: 'REST API', sub: false },
  { href: '#api-coupons', label: 'Coupons', sub: true },
  { href: '#api-stores', label: 'Stores', sub: true },
  { href: '#api-search', label: 'Search', sub: true },
  { href: '#api-reveal', label: 'Reveal and sync', sub: true },
  { href: '#mcp', label: 'MCP', sub: false },
  { href: '#contributing', label: 'Contributing', sub: false },
];

export default function DocsPage() {
  return (
    <div className="flex flex-col lg:flex-row gap-12 max-w-5xl mx-auto">

      {/* Sidebar */}
      <aside className="lg:w-48 shrink-0">
        <div className="lg:sticky lg:top-20">
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-3 px-2">Contents</p>
          <nav className="flex flex-col gap-0.5">
            {nav.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className={`text-sm px-2 py-1.5 rounded-lg transition-colors hover:bg-orange-50 hover:text-orange-600 text-gray-600 ${
                  item.sub ? 'pl-5 text-[13px] text-gray-500' : 'font-medium'
                }`}
              >
                {item.label}
              </a>
            ))}
          </nav>
          <div className="mt-6 pt-4 border-t border-gray-200">
            <Link href="/" className="text-xs text-gray-400 hover:text-orange-500 transition-colors px-2">
              ← Back home
            </Link>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 min-w-0 flex flex-col gap-14">

        {/* Header */}
        <div>
          <h1 className="text-3xl font-black text-gray-900">Documentation</h1>
          <p className="text-gray-500 mt-2 text-base">
            Use c0upons from the web, terminal, or your own apps.
          </p>
        </div>

        {/* Overview */}
        <section id="overview" className="scroll-mt-20 flex flex-col gap-5">
          <h2 className="text-xl font-bold text-gray-900 pb-2 border-b border-gray-200">Overview</h2>
          <p className="text-gray-600 leading-relaxed">
            <strong>c0upons</strong> is an open-source, community-powered coupon platform.
            Browse and submit deals for free on the web, or use the CLI and API to integrate
            savings into your own tools.
          </p>
          <div className="grid sm:grid-cols-3 gap-3">
            {[
              { icon: '🌐', title: 'Web', desc: 'Browse and submit at c0upons.com' },
              { icon: '⌨️', title: 'CLI', desc: 'Search deals from your terminal' },
              { icon: '🔌', title: 'API', desc: 'Integrate into your own apps' },
            ].map((f) => (
              <div key={f.title} className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                <div className="text-2xl mb-2">{f.icon}</div>
                <div className="font-semibold text-gray-900 text-sm">{f.title}</div>
                <div className="text-xs text-gray-500 mt-0.5">{f.desc}</div>
              </div>
            ))}
          </div>
        </section>

        {/* CLI */}
        <section id="cli" className="scroll-mt-20 flex flex-col gap-5">
          <h2 className="text-xl font-bold text-gray-900 pb-2 border-b border-gray-200">CLI</h2>
          <p className="text-gray-600 leading-relaxed">
            The <IC>c0upons</IC> CLI is a bash script that works on macOS and Linux.
            Requires <IC>curl</IC> and <IC>jq</IC>.
          </p>
        </section>

        <section id="cli-install" className="scroll-mt-20 flex flex-col gap-4">
          <h3 className="text-base font-bold text-gray-800">Installation</h3>
          <Code>{`curl -fsSL https://c0upons.com/install.sh | sh`}</Code>
          <p className="text-sm text-gray-500">
            Installs to <IC>/usr/local/bin/c0upons</IC> (or <IC>~/.local/bin</IC> without sudo).
          </p>

          <h3 className="text-base font-bold text-gray-800 mt-2">Upgrade</h3>
          <Code>{`c0upons upgrade`}</Code>

          <h3 className="text-base font-bold text-gray-800 mt-2">Uninstall</h3>
          <Code>{`c0upons remove`}</Code>

          <h3 className="text-base font-bold text-gray-800 mt-2">Dependencies</h3>
          <div className="border border-gray-200 rounded-lg overflow-hidden text-sm">
            <table className="w-full border-collapse">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left px-4 py-2.5 text-gray-500 font-medium border-b border-gray-200">Tool</th>
                  <th className="text-left px-4 py-2.5 text-gray-500 font-medium border-b border-gray-200">Required</th>
                  <th className="text-left px-4 py-2.5 text-gray-500 font-medium border-b border-gray-200">Install</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {[
                  { tool: 'curl', req: 'Yes', install: 'Pre-installed on most systems' },
                  { tool: 'jq', req: 'Yes', install: 'brew install jq · apt install jq' },
                  { tool: 'python3', req: 'Optional', install: 'Used for URL encoding fallback' },
                ].map((row) => (
                  <tr key={row.tool}>
                    <td className="px-4 py-2.5"><IC>{row.tool}</IC></td>
                    <td className="px-4 py-2.5 text-gray-600">{row.req}</td>
                    <td className="px-4 py-2.5 text-gray-500">{row.install}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section id="cli-commands" className="scroll-mt-20 flex flex-col gap-6">
          <h3 className="text-base font-bold text-gray-800">Commands</h3>
          {CLI_COMMANDS.map((item) => (
            <div key={item.cmd} className="flex flex-col gap-2">
              <IC>{item.cmd}</IC>
              <p className="text-sm text-gray-600">{item.desc}</p>
              <Code>{item.example}</Code>
            </div>
          ))}

          <div className="mt-2">
            <h3 className="text-base font-bold text-gray-800 mb-3">Environment</h3>
            <div className="border border-gray-200 rounded-lg overflow-hidden text-sm">
              <table className="w-full border-collapse">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="text-left px-4 py-2.5 text-gray-500 font-medium border-b border-gray-200">Variable</th>
                    <th className="text-left px-4 py-2.5 text-gray-500 font-medium border-b border-gray-200">Default</th>
                    <th className="text-left px-4 py-2.5 text-gray-500 font-medium border-b border-gray-200">Description</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="px-4 py-2.5"><IC>C0UPONS_API</IC></td>
                    <td className="px-4 py-2.5 text-gray-500 font-mono text-xs">https://c0upons.com/api</td>
                    <td className="px-4 py-2.5 text-gray-500">Override the API base URL</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* API */}
        <section id="api" className="scroll-mt-20 flex flex-col gap-5">
          <h2 className="text-xl font-bold text-gray-900 pb-2 border-b border-gray-200">REST API</h2>
          <p className="text-gray-600 leading-relaxed">
            No authentication required for read operations. Base URL:{' '}
            <IC>https://c0upons.com/api</IC>
          </p>
        </section>

        <section id="api-coupons" className="scroll-mt-20 flex flex-col gap-4">
          <h3 className="text-base font-bold text-gray-800">Coupons</h3>
          <Endpoint
            method="GET"
            path="/api/coupons"
            desc="Returns all coupons ordered by votes descending."
            example="curl https://c0upons.com/api/coupons"
            response={`[
  {
    "id": 1,
    "store_id": 42,
    "code": "SAVE20",
    "title": "20% off sitewide",
    "discount": "20%",
    "expiry_date": "2025-12-31",
    "verified": 1,
    "votes": 47,
    "store_name": "Example Store",
    "store_slug": "example-store"
  }
]`}
          />
          <Endpoint
            method="GET"
            path="/api/coupons/[id]"
            desc="Returns a single coupon by ID."
            example="curl https://c0upons.com/api/coupons/1"
          />
          <Endpoint
            method="POST"
            path="/api/coupons"
            desc="Submit a new coupon."
            example={`curl -X POST https://c0upons.com/api/coupons \\
  -H "Content-Type: application/json" \\
  -d '{"store_id":42,"title":"20% off","code":"SAVE20","discount":"20%"}'`}
          />
        </section>

        <section id="api-stores" className="scroll-mt-20 flex flex-col gap-4">
          <h3 className="text-base font-bold text-gray-800">Stores</h3>
          <Endpoint
            method="GET"
            path="/api/stores"
            desc="Returns all stores alphabetically."
            example="curl https://c0upons.com/api/stores"
          />
          <Endpoint
            method="GET"
            path="/api/stores/[slug]"
            desc="Returns a store and its coupons."
            example="curl https://c0upons.com/api/stores/nike"
          />
        </section>

        <section id="api-search" className="scroll-mt-20 flex flex-col gap-4">
          <h3 className="text-base font-bold text-gray-800">Search</h3>
          <Endpoint
            method="GET"
            path="/api/search?q=query"
            desc="Full-text search across coupon titles, descriptions, codes, and store names."
            example={`curl "https://c0upons.com/api/search?q=nike"`}
          />
        </section>

        <section id="api-reveal" className="scroll-mt-20 flex flex-col gap-4">
          <h3 className="text-base font-bold text-gray-800">Reveal and sync</h3>
          <p className="text-gray-600 leading-relaxed text-sm">
            Coupons arrive from nichedb.dev&apos;s deals collection, and the ones whose code is hidden
            behind a &quot;show code&quot; button get their deal page read by a real browser. Both are
            keyless: they only read public pages and write nothing you could not have submitted.
            A reveal takes up to a minute.
          </p>
          <Endpoint
            method="POST"
            path="/api/coupons/[id]/reveal"
            desc="Read the coupon's deal page with a browser, click what a shopper would, and store any code found. Cached for a day when the page had none."
            example="curl -X POST https://c0upons.com/api/coupons/67/reveal"
            response={`{
  "code": "SAVE25NOW",
  "method": "clicked",
  "engine": "heuristic",
  "notes": "after \\"Show Code\\"",
  "checked_at": "2026-09-13T01:20:00.000Z"
}`}
          />
          <Endpoint
            method="POST"
            path="/api/sync/reveal"
            desc="Read the deal pages of up to three coupons that have no code yet, most-voted first. Answers how many are still waiting."
            example="curl -X POST https://c0upons.com/api/sync/reveal"
            response={`{
  "ok": true,
  "remaining": 287,
  "found": 1,
  "checked": [{ "id": 67, "code": null, "method": "none", "engine": "heuristic", "notes": "no code on the page", "checked_at": "..." }]
}`}
          />
          <Endpoint
            method="POST"
            path="/api/sync/nichedb"
            desc="Pull the next pages of nichedb.dev's deals collection into stores and coupons. Throttled to one run per ten minutes."
            example="curl -X POST https://c0upons.com/api/sync/nichedb"
            response={`{ "ok": true, "skipped": false, "fetched": 267, "upserted": 239, "stores": 36, "cursor": 8317456, "more": false }`}
          />
          <Endpoint
            method="POST"
            path="/api/sync/reddit"
            desc="Read the newest r/couponcodes posts into stores and coupons. A post with a code or a link to the store becomes a listing; a request for a code is skipped. The server polls this itself every five minutes; throttled to one run per four minutes."
            example="curl -X POST https://c0upons.com/api/sync/reddit"
            response={`{ "ok": true, "skipped": false, "via": "relay", "fetched": 25, "taken": 18, "inserted": 2, "updated": 16, "declined": 7, "stores": 17, "newest": "t3_1wf5dvp" }`}
          />
        </section>

        {/* MCP */}
        <section id="mcp" className="scroll-mt-20 flex flex-col gap-5">
          <h2 className="text-xl font-bold text-gray-900 pb-2 border-b border-gray-200">MCP</h2>
          <p className="text-gray-600 leading-relaxed">
            Everything above is also a Model Context Protocol server, so an agent can search coupons,
            read a store, and have the browser reveal a code without leaving its tools. Stateless
            JSON-RPC over POST at <IC>https://c0upons.com/mcp</IC> (also <IC>/api/mcp</IC>), no key.
            The descriptor for catalogs is at <IC>/.well-known/openmcp.json</IC>.
          </p>
          <Code>{`# Claude Code
claude mcp add --transport http c0upons https://c0upons.com/mcp

# Any client: list the tools
curl -X POST https://c0upons.com/mcp -H 'content-type: application/json' \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`}</Code>
          <div className="grid sm:grid-cols-2 gap-3 text-sm">
            {[
              ['search_coupons', 'Search by store, title, description or code.'],
              ['top_coupons', 'The most voted coupons.'],
              ['list_stores', 'Every store with its coupon count.'],
              ['store_coupons', "One store's coupons by slug."],
              ['get_coupon', 'One coupon by id.'],
              ['reveal_code', "Read a coupon's deal page with a browser and return the code it finds."],
              ['sync_deals', 'Pull the next deals from nichedb.dev.'],
              ['sync_reddit', 'Read the newest r/couponcodes posts.'],
              ['reveal_pending', 'Read the pages of up to three code-less coupons.'],
            ].map(([name, desc]) => (
              <div key={name} className="border border-gray-200 rounded-lg px-4 py-3">
                <IC>{name}</IC>
                <p className="text-gray-600 mt-1">{desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Contributing */}
        <section id="contributing" className="scroll-mt-20 flex flex-col gap-5">
          <h2 className="text-xl font-bold text-gray-900 pb-2 border-b border-gray-200">Contributing</h2>
          <p className="text-gray-600 leading-relaxed">
            c0upons is open source. Contributions are welcome — submit coupons via the web, report
            bugs, or open a pull request.
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              href="/submit"
              className="flex-1 bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold px-4 py-3 rounded-lg text-center transition-colors"
            >
              Submit a coupon →
            </Link>
            <a
              href="https://github.com/profullstack/c0upons"
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 border border-gray-200 hover:border-gray-300 text-gray-700 text-sm font-semibold px-4 py-3 rounded-lg text-center transition-colors"
            >
              View on GitHub ↗
            </a>
          </div>
          <h3 className="text-base font-bold text-gray-800 mt-2">Submit via API</h3>
          <Code>{`curl -X POST https://c0upons.com/api/coupons \\
  -H "Content-Type: application/json" \\
  -d '{"store_id": 1, "title": "15% off everything", "code": "GET15"}'`}</Code>
        </section>

      </div>
    </div>
  );
}
