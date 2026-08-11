import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="bg-gray-900 text-gray-400 mt-20">
      <div className="max-w-7xl mx-auto px-4 py-14">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-10 mb-12">
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="text-xl font-black text-orange-500 tracking-tight">
              c0upons
            </Link>
            <p className="mt-3 text-sm leading-relaxed">
              Community-powered coupon codes and deals. Save more with codes shared by real people.
            </p>
            <div className="mt-4 flex gap-3">
              <a
                href="https://github.com/profullstack/c0upons"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-500 hover:text-white transition-colors"
                aria-label="GitHub"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                </svg>
              </a>
            </div>
          </div>

          <div className="flex flex-col gap-3 text-sm">
            <span className="font-semibold text-gray-200 text-xs uppercase tracking-widest">Browse</span>
            <Link href="/" className="hover:text-white transition-colors">Home</Link>
            <Link href="/stores" className="hover:text-white transition-colors">All Stores</Link>
            <Link href="/search" className="hover:text-white transition-colors">Search</Link>
            <Link href="/submit" className="hover:text-white transition-colors">Submit a Code</Link>
            <Link href="/bounties" className="hover:text-white transition-colors">Bounties</Link>
            <Link href="/blog" className="hover:text-white transition-colors">Blog</Link>
            <Link href="/about" className="hover:text-white transition-colors">About</Link>
            <Link href="/team" className="hover:text-white transition-colors">Team</Link>
            <Link href="/privacy" className="hover:text-white transition-colors">Privacy</Link>
            <Link href="/terms" className="hover:text-white transition-colors">Terms</Link>
          </div>

          <div className="flex flex-col gap-3 text-sm">
            <span className="font-semibold text-gray-200 text-xs uppercase tracking-widest">Developers</span>
            <Link href="/blog" className="hover:text-white transition-colors">Blog</Link>
            <Link href="/blog/rss.xml" className="hover:text-white transition-colors">RSS Feed</Link>
            <Link href="/docs" className="hover:text-white transition-colors">Documentation</Link>
            <Link href="/docs#cli" className="hover:text-white transition-colors">CLI</Link>
            <Link href="/docs#api" className="hover:text-white transition-colors">REST API</Link>
            <a
              href="https://github.com/profullstack/c0upons"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-white transition-colors"
            >
              GitHub ↗
            </a>
          </div>

          <div className="flex flex-col gap-3 text-sm">
            <span className="font-semibold text-gray-200 text-xs uppercase tracking-widest">Install CLI</span>
            <code className="text-xs bg-gray-800 text-orange-400 rounded px-3 py-2 font-mono leading-relaxed block">
              curl -fsSL https://c0upons.com/install.sh | sh
            </code>
            <Link href="/docs#cli" className="text-xs text-orange-500 hover:text-orange-400 transition-colors">
              View CLI docs →
            </Link>
          </div>
        </div>

        <div className="border-t border-gray-800 pt-6 flex flex-col sm:flex-row justify-between items-center gap-3 text-xs text-gray-500">
          <p>© {new Date().getFullYear()} c0upons. Community-powered savings.</p>
          <p>Built with Next.js · Powered by Turso</p>
        </div>
      </div>
    </footer>
  );
}
