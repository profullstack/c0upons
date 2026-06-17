export const dynamic = 'force-dynamic';

import type { Metadata } from 'next';
import Link from 'next/link';
import { getDb } from '@/lib/db';
import { getSessionDid } from '@/lib/auth';

export const metadata: Metadata = {
  title: 'Coupon Bounties',
  description: 'Post a bounty and pay someone to find a coupon code for your favourite store.',
  alternates: { canonical: 'https://c0upons.com/bounties' },
};

interface Bounty {
  id: number;
  public_id: string;
  title: string;
  description: string | null;
  reward_usd: number;
  status: string;
  store_name: string | null;
  store_name_resolved: string | null;
  creator_did: string;
  created_at: string;
}

async function getBounties(): Promise<Bounty[]> {
  try {
    const db = getDb();
    return await db.sql`
      SELECT b.*, s.name AS store_name_resolved
      FROM bounties b
      LEFT JOIN stores s ON s.id = b.store_id
      WHERE b.status IN ('open', 'funded')
      ORDER BY b.reward_usd DESC, b.created_at DESC
      LIMIT 50
    `;
  } catch { return []; }
}

const STATUS_COLORS: Record<string, string> = {
  open: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  funded: 'bg-green-50 text-green-700 border-green-200',
  claimed: 'bg-blue-50 text-blue-700 border-blue-200',
  paid: 'bg-gray-100 text-gray-500 border-gray-200',
};

const FAQ = [
  {
    q: 'What is a coupon bounty?',
    a: 'A bounty is a cash reward posted by a shopper who wants a working coupon code for a specific store. Anyone can submit a valid code to claim the reward.',
  },
  {
    q: 'How much can I earn?',
    a: 'Bounty creators set their own reward amount (minimum $0.10). Rewards are paid instantly to your CoinPay DID as soon as a valid code is accepted.',
  },
  {
    q: 'How do I post a bounty?',
    a: 'Connect your CoinPay account, then click "Post Bounty". Name the store, describe the discount you\'re looking for, and set your reward amount.',
  },
  {
    q: 'What happens if no code is found?',
    a: 'Open bounties remain listed until a valid code is submitted or the creator cancels. Funds are only released when a working code is confirmed.',
  },
];

export default async function BountiesPage() {
  const [bounties, did] = await Promise.all([getBounties(), getSessionDid()]);
  const storeName = (b: Bounty) => b.store_name_resolved ?? b.store_name ?? 'Any store';

  return (
    <div className="flex flex-col gap-10 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-gray-900">Coupon Bounties</h1>
          <p className="text-gray-500 mt-1">
            Post a reward and let the community hunt down a coupon code for you.
          </p>
        </div>
        {did ? (
          <Link
            href="/bounties/new"
            className="shrink-0 bg-orange-500 hover:bg-orange-600 text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition-colors"
          >
            + Post Bounty
          </Link>
        ) : (
          <a
            href="/api/auth/coinpay?returnTo=/bounties/new"
            className="shrink-0 bg-gray-900 hover:bg-gray-700 text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition-colors"
          >
            Connect to Post
          </a>
        )}
      </div>

      {/* How it works */}
      <div className="grid sm:grid-cols-3 gap-4">
        {[
          { icon: '💰', step: '1', title: 'Post a bounty', desc: 'Name the store and how much you\'ll pay for a working coupon code (min $0.10).' },
          { icon: '🔍', step: '2', title: 'Community hunts', desc: 'Anyone can submit a coupon code to claim your bounty reward.' },
          { icon: '✅', step: '3', title: 'Get paid', desc: 'When a valid code is submitted, the reward is sent to the hunter\'s CoinPay DID instantly.' },
        ].map((item) => (
          <div key={item.step} className="bg-gray-50 border border-gray-200 rounded-xl p-4 flex flex-col gap-2">
            <span className="text-2xl">{item.icon}</span>
            <span className="font-bold text-gray-900 text-sm">{item.title}</span>
            <span className="text-xs text-gray-500 leading-relaxed">{item.desc}</span>
          </div>
        ))}
      </div>

      {/* Bounty list */}
      {bounties.length === 0 ? (
        <div className="flex flex-col gap-8">
          <div className="text-center py-14 border border-dashed border-gray-200 rounded-2xl">
            <p className="text-gray-500 font-medium text-lg">No open bounties yet.</p>
            <p className="text-sm text-gray-400 mt-1 mb-5">
              Be the first to post one — set any reward amount and let the community find your code.
            </p>
            {did ? (
              <Link
                href="/bounties/new"
                className="inline-flex bg-orange-500 hover:bg-orange-600 text-white font-semibold px-6 py-2.5 rounded-xl text-sm transition-colors"
              >
                Post the first bounty
              </Link>
            ) : (
              <a
                href="/api/auth/coinpay?returnTo=/bounties/new"
                className="inline-flex bg-gray-900 hover:bg-gray-700 text-white font-semibold px-6 py-2.5 rounded-xl text-sm transition-colors"
              >
                Connect &amp; post a bounty
              </a>
            )}
          </div>

          {/* FAQ — keeps the page content-rich for crawlers even when list is empty */}
          <section>
            <h2 className="text-xl font-bold text-gray-900 mb-5">Frequently asked questions</h2>
            <dl className="flex flex-col gap-5">
              {FAQ.map(({ q, a }) => (
                <div key={q} className="bg-gray-50 border border-gray-200 rounded-xl p-5">
                  <dt className="font-semibold text-gray-900 text-sm mb-1">{q}</dt>
                  <dd className="text-sm text-gray-500 leading-relaxed">{a}</dd>
                </div>
              ))}
            </dl>
          </section>

          {/* Benefits */}
          <section className="bg-orange-50 rounded-2xl p-8">
            <h2 className="text-lg font-bold text-gray-900 mb-3">Why use c0upons bounties?</h2>
            <ul className="flex flex-col gap-2 text-sm text-gray-600">
              <li className="flex items-start gap-2">
                <span className="text-orange-500 font-bold mt-0.5">✓</span>
                Instant crypto payouts — no waiting for bank transfers or gift cards
              </li>
              <li className="flex items-start gap-2">
                <span className="text-orange-500 font-bold mt-0.5">✓</span>
                You only pay when a working code is confirmed — no risk of paying for duds
              </li>
              <li className="flex items-start gap-2">
                <span className="text-orange-500 font-bold mt-0.5">✓</span>
                The whole community is incentivised to find the best coupon for your store
              </li>
              <li className="flex items-start gap-2">
                <span className="text-orange-500 font-bold mt-0.5">✓</span>
                Found codes are added to c0upons so future shoppers benefit too
              </li>
            </ul>
          </section>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {bounties.map((b) => (
            <Link
              key={b.id}
              href={`/bounties/${b.public_id}`}
              className="group border border-gray-200 rounded-xl p-5 flex items-center gap-4 hover:border-orange-300 hover:shadow-lg hover:shadow-orange-50 transition-all"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="font-semibold text-gray-900 group-hover:text-orange-500 transition-colors">
                    {b.title}
                  </h2>
                  <span className={`text-xs font-medium border px-2 py-0.5 rounded-full ${STATUS_COLORS[b.status] ?? ''}`}>
                    {b.status}
                  </span>
                </div>
                <p className="text-sm text-gray-500 mt-0.5">{storeName(b)}</p>
                {b.description && (
                  <p className="text-xs text-gray-400 mt-1 line-clamp-1">{b.description}</p>
                )}
              </div>
              <div className="shrink-0 text-right">
                <div className="text-xl font-black text-orange-500">${b.reward_usd.toFixed(2)}</div>
                <div className="text-xs text-gray-400">reward</div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
