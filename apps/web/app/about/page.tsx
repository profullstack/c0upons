import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'About',
  description: 'c0upons is a free, open-source community coupon platform built by Profullstack, Inc.',
  alternates: { canonical: 'https://c0upons.com/about' },
};

export default function AboutPage() {
  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-10">
      <div>
        <h1 className="text-3xl font-black text-gray-900">About c0upons</h1>
        <p className="text-gray-500 mt-2">Community-powered savings, open source and free forever.</p>
      </div>

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-bold text-gray-900 border-b border-gray-200 pb-2">What is c0upons?</h2>
        <p className="text-gray-600 leading-relaxed">
          c0upons is a free, community-driven coupon code directory. Anyone can browse deals,
          copy promo codes, vote on the best ones, and submit new codes — no account required.
          The community votes codes up or down, so the most useful deals always rise to the top.
        </p>
        <p className="text-gray-600 leading-relaxed">
          We believe saving money shouldn't require installing a browser extension, creating an
          account, or wading through ads. c0upons is a fast, simple, open platform anyone can use
          and contribute to.
        </p>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-bold text-gray-900 border-b border-gray-200 pb-2">Who built it?</h2>
        <p className="text-gray-600 leading-relaxed">
          c0upons is built and maintained by{' '}
          <a href="https://profullstack.com" target="_blank" rel="noopener noreferrer" className="text-orange-500 hover:underline font-medium">
            Profullstack, Inc.
          </a>{' '}
          — a software studio focused on open-source developer tools and community platforms.
        </p>
        <p className="text-gray-600 leading-relaxed">
          The project is open source under the MIT license. Contributions, bug reports,
          and feature requests are welcome on{' '}
          <a href="https://github.com/profullstack/c0upons" target="_blank" rel="noopener noreferrer" className="text-orange-500 hover:underline font-medium">
            GitHub
          </a>.
        </p>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-bold text-gray-900 border-b border-gray-200 pb-2">How it works</h2>
        <ul className="flex flex-col gap-3">
          {[
            { step: '1', title: 'Browse', desc: 'Search or browse by store to find coupon codes for hundreds of retailers.' },
            { step: '2', title: 'Copy', desc: 'Click "Copy" to copy a coupon code instantly to your clipboard.' },
            { step: '3', title: 'Vote', desc: 'Connect with CoinPay to vote codes up so the best ones stay visible.' },
            { step: '4', title: 'Submit', desc: 'Found a code not on the site? Submit it in seconds via the submission form or REST API.' },
          ].map((item) => (
            <li key={item.step} className="flex gap-4 items-start">
              <span className="w-7 h-7 bg-orange-500 text-white text-sm font-black rounded-full flex items-center justify-center shrink-0 mt-0.5">
                {item.step}
              </span>
              <div>
                <span className="font-semibold text-gray-900">{item.title} — </span>
                <span className="text-gray-600">{item.desc}</span>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-bold text-gray-900 border-b border-gray-200 pb-2">Contact</h2>
        <p className="text-gray-600">
          For general enquiries, bug reports, or partnership requests, email{' '}
          <a href="mailto:anthony@profullstack.com" className="text-orange-500 hover:underline font-medium">
            anthony@profullstack.com
          </a>.
        </p>
        <p className="text-gray-600">
          For security issues, see our{' '}
          <a href="/.well-known/security.txt" className="text-orange-500 hover:underline font-medium">
            security.txt
          </a>.
        </p>
      </section>

      <div className="flex gap-4">
        <Link href="/" className="bg-orange-500 hover:bg-orange-600 text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition-colors">
          Browse coupons
        </Link>
        <a
          href="https://github.com/profullstack/c0upons"
          target="_blank"
          rel="noopener noreferrer"
          className="border border-gray-200 hover:border-gray-300 text-gray-700 font-semibold px-5 py-2.5 rounded-xl text-sm transition-colors"
        >
          View on GitHub ↗
        </a>
      </div>
    </div>
  );
}
