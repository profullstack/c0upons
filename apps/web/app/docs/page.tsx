import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Docs — c0upons',
  description: 'Documentation for the c0upons CLI and REST API.',
};

function Section({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <section id={id} className="flex flex-col gap-4 scroll-mt-20">
      {children}
    </section>
  );
}

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="text-2xl font-bold text-slate-900 border-b border-slate-200 pb-3">{children}</h2>;
}

function H3({ children }: { children: React.ReactNode }) {
  return <h3 className="text-base font-bold text-slate-800 mt-2">{children}</h3>;
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <pre className="bg-slate-900 text-slate-100 rounded-xl p-4 text-sm font-mono leading-relaxed overflow-x-auto">
      <code>{children}</code>
    </pre>
  );
}

function InlineCode({ children }: { children: React.ReactNode }) {
  return (
    <code className="bg-slate-100 text-orange-600 text-sm font-mono px-1.5 py-0.5 rounded">
      {children}
    </code>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block bg-orange-100 text-orange-700 text-xs font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">
      {children}
    </span>
  );
}

const nav = [
  { href: '#overview', label: 'Overview' },
  { href: '#cli', label: 'CLI' },
  { href: '#cli-install', label: '  Installation' },
  { href: '#cli-commands', label: '  Commands' },
  { href: '#api', label: 'REST API' },
  { href: '#api-coupons', label: '  Coupons' },
  { href: '#api-stores', label: '  Stores' },
  { href: '#api-search', label: '  Search' },
  { href: '#contributing', label: 'Contributing' },
];

export default function DocsPage() {
  return (
    <div className="flex flex-col lg:flex-row gap-10 max-w-5xl mx-auto">
      {/* Sidebar */}
      <aside className="lg:w-52 shrink-0">
        <div className="lg:sticky lg:top-20 flex flex-col gap-1">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 px-3">On this page</p>
          {nav.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className={`text-sm px-3 py-1.5 rounded-lg transition-colors hover:bg-slate-100 hover:text-orange-500 text-slate-600 ${
                item.label.startsWith('  ') ? 'pl-6 text-xs' : 'font-medium'
              }`}
            >
              {item.label.trim()}
            </a>
          ))}
          <div className="mt-4 pt-4 border-t border-slate-100">
            <Link
              href="/"
              className="text-xs text-slate-400 hover:text-orange-500 transition-colors px-3"
            >
              ← Back to coupons
            </Link>
          </div>
        </div>
      </aside>

      {/* Content */}
      <div className="flex-1 min-w-0 flex flex-col gap-12">
        <div>
          <h1 className="text-3xl font-black text-slate-900">Documentation</h1>
          <p className="text-slate-500 mt-2">
            Everything you need to use c0upons from the web, terminal, or your own apps.
          </p>
        </div>

        {/* Overview */}
        <Section id="overview">
          <H2>Overview</H2>
          <p className="text-slate-600 leading-relaxed">
            <strong>c0upons</strong> is a community-powered coupon code platform. Anyone can browse
            deals for free, submit codes, and vote on the best ones. It also exposes a simple REST
            API and a bash CLI so developers can integrate savings into their own workflows.
          </p>
          <div className="grid sm:grid-cols-3 gap-4">
            {[
              { icon: '🌐', title: 'Web App', desc: 'Browse and submit coupons at c0upons.com' },
              { icon: '⌨️', title: 'CLI', desc: 'Search deals without leaving the terminal' },
              { icon: '🔌', title: 'REST API', desc: 'Integrate coupons into your own apps' },
            ].map((f) => (
              <div key={f.title} className="border border-slate-200 rounded-xl p-4 flex flex-col gap-2">
                <span className="text-2xl">{f.icon}</span>
                <span className="font-semibold text-slate-900 text-sm">{f.title}</span>
                <span className="text-xs text-slate-500">{f.desc}</span>
              </div>
            ))}
          </div>
        </Section>

        {/* CLI */}
        <Section id="cli">
          <H2>CLI</H2>
          <p className="text-slate-600 leading-relaxed">
            The <InlineCode>c0upons</InlineCode> CLI is a bash script that lets you search coupons,
            list stores, and browse deals from your terminal. It requires <InlineCode>curl</InlineCode>{' '}
            and <InlineCode>jq</InlineCode>.
          </p>
        </Section>

        <Section id="cli-install">
          <H3>Installation</H3>
          <p className="text-sm text-slate-600">Install with one command:</p>
          <Code>{`curl -fsSL https://c0upons.com/install.sh | sh`}</Code>
          <p className="text-sm text-slate-600">
            The installer places the script in <InlineCode>/usr/local/bin/c0upons</InlineCode> (or{' '}
            <InlineCode>~/.local/bin</InlineCode> if you don&apos;t have sudo). Verify the install:
          </p>
          <Code>{`c0upons version`}</Code>
          <p className="text-sm text-slate-500">
            You can also <a href="/cli/c0upons" className="text-orange-500 hover:underline">download the script directly</a> and place it anywhere in your <InlineCode>$PATH</InlineCode>.
          </p>

          <H3>Dependencies</H3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-2 px-3 text-slate-500 font-medium">Tool</th>
                  <th className="text-left py-2 px-3 text-slate-500 font-medium">Required</th>
                  <th className="text-left py-2 px-3 text-slate-500 font-medium">Install</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { tool: 'curl', req: 'Yes', install: 'Usually pre-installed' },
                  { tool: 'jq', req: 'Yes', install: 'brew install jq / apt install jq' },
                  { tool: 'python3', req: 'Optional', install: 'Used for URL encoding' },
                ].map((row) => (
                  <tr key={row.tool} className="border-b border-slate-100">
                    <td className="py-2 px-3"><InlineCode>{row.tool}</InlineCode></td>
                    <td className="py-2 px-3 text-slate-600">{row.req}</td>
                    <td className="py-2 px-3 text-slate-500">{row.install}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section id="cli-commands">
          <H3>Commands</H3>
          <div className="flex flex-col gap-6">
            {[
              {
                cmd: 'c0upons search <query>',
                desc: 'Search for coupons matching a query string.',
                example: 'c0upons search nike\nc0upons search "20% off"',
              },
              {
                cmd: 'c0upons stores',
                desc: 'List all stores with coupons.',
                example: 'c0upons stores',
              },
              {
                cmd: 'c0upons store <slug>',
                desc: 'Show all coupons for a specific store.',
                example: 'c0upons store nike\nc0upons store amazon',
              },
              {
                cmd: 'c0upons latest',
                desc: 'Show the most recently added coupons.',
                example: 'c0upons latest',
              },
              {
                cmd: 'c0upons version',
                desc: 'Print the installed CLI version.',
                example: 'c0upons version',
              },
            ].map((item) => (
              <div key={item.cmd} className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <InlineCode>{item.cmd}</InlineCode>
                </div>
                <p className="text-sm text-slate-600">{item.desc}</p>
                <Code>{item.example}</Code>
              </div>
            ))}
          </div>

          <H3>Environment variables</H3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-2 px-3 text-slate-500 font-medium">Variable</th>
                  <th className="text-left py-2 px-3 text-slate-500 font-medium">Default</th>
                  <th className="text-left py-2 px-3 text-slate-500 font-medium">Description</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="py-2 px-3"><InlineCode>C0UPONS_API</InlineCode></td>
                  <td className="py-2 px-3 text-slate-500">https://c0upons.com/api</td>
                  <td className="py-2 px-3 text-slate-600">Override the API base URL (e.g. for self-hosting)</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Section>

        {/* REST API */}
        <Section id="api">
          <H2>REST API</H2>
          <p className="text-slate-600 leading-relaxed">
            The c0upons API is a simple JSON REST API. No authentication is required for read operations.
            The base URL is <InlineCode>https://c0upons.com/api</InlineCode>.
          </p>
        </Section>

        <Section id="api-coupons">
          <H3>Coupons</H3>
          <div className="flex flex-col gap-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Badge>GET</Badge>
                <InlineCode>/api/coupons</InlineCode>
              </div>
              <p className="text-sm text-slate-600 mb-3">Returns a list of coupons ordered by votes descending.</p>
              <Code>{`curl https://c0upons.com/api/coupons`}</Code>
              <p className="text-sm text-slate-500 mt-2">Response:</p>
              <Code>{`[
  {
    "id": 1,
    "store_id": 42,
    "code": "SAVE20",
    "title": "20% off sitewide",
    "description": "Valid on all orders over $50",
    "discount": "20%",
    "expiry_date": "2025-12-31",
    "verified": 1,
    "votes": 47,
    "url": null,
    "store_name": "Example Store",
    "store_slug": "example-store"
  }
]`}</Code>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-2">
                <Badge>GET</Badge>
                <InlineCode>/api/coupons/[id]</InlineCode>
              </div>
              <p className="text-sm text-slate-600 mb-3">Returns a single coupon by ID.</p>
              <Code>{`curl https://c0upons.com/api/coupons/1`}</Code>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-2">
                <Badge>POST</Badge>
                <InlineCode>/api/coupons</InlineCode>
              </div>
              <p className="text-sm text-slate-600 mb-3">Submit a new coupon.</p>
              <Code>{`curl -X POST https://c0upons.com/api/coupons \\
  -H "Content-Type: application/json" \\
  -d '{
    "store_id": 42,
    "title": "20% off sitewide",
    "code": "SAVE20",
    "discount": "20%",
    "expiry_date": "2025-12-31"
  }'`}</Code>
            </div>
          </div>
        </Section>

        <Section id="api-stores">
          <H3>Stores</H3>
          <div className="flex flex-col gap-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Badge>GET</Badge>
                <InlineCode>/api/stores</InlineCode>
              </div>
              <p className="text-sm text-slate-600 mb-3">Returns all stores alphabetically.</p>
              <Code>{`curl https://c0upons.com/api/stores`}</Code>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Badge>GET</Badge>
                <InlineCode>/api/stores/[slug]</InlineCode>
              </div>
              <p className="text-sm text-slate-600 mb-3">Returns a store and its coupons.</p>
              <Code>{`curl https://c0upons.com/api/stores/nike`}</Code>
            </div>
          </div>
        </Section>

        <Section id="api-search">
          <H3>Search</H3>
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Badge>GET</Badge>
              <InlineCode>/api/search?q=query</InlineCode>
            </div>
            <p className="text-sm text-slate-600 mb-3">
              Full-text search across coupon titles, descriptions, codes, and store names.
            </p>
            <Code>{`curl "https://c0upons.com/api/search?q=nike"`}</Code>
          </div>
        </Section>

        {/* Contributing */}
        <Section id="contributing">
          <H2>Contributing</H2>
          <p className="text-slate-600 leading-relaxed">
            c0upons is open source. Contributions are welcome — whether it&apos;s adding coupon codes via
            the web app, reporting bugs, or submitting pull requests.
          </p>
          <div className="flex flex-col gap-3">
            <H3>Submit a coupon via the web</H3>
            <p className="text-sm text-slate-600">
              The easiest way to contribute is to{' '}
              <Link href="/submit" className="text-orange-500 hover:underline font-medium">submit a coupon</Link>{' '}
              through the web interface.
            </p>

            <H3>Submit via the CLI</H3>
            <p className="text-sm text-slate-600">Coming soon — the CLI will support interactive coupon submission.</p>

            <H3>Submit via the API</H3>
            <Code>{`curl -X POST https://c0upons.com/api/coupons \\
  -H "Content-Type: application/json" \\
  -d '{"store_id": 1, "title": "15% off", "code": "GET15"}'`}</Code>

            <H3>Source code</H3>
            <p className="text-sm text-slate-600">
              The full source is on{' '}
              <a
                href="https://github.com/profullstack/c0upons"
                target="_blank"
                rel="noopener noreferrer"
                className="text-orange-500 hover:underline font-medium"
              >
                GitHub ↗
              </a>
              . Open an issue or PR anytime.
            </p>
          </div>
        </Section>
      </div>
    </div>
  );
}
