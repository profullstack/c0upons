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
        <div className="text-center py-16 border border-dashed border-gray-200 rounded-2xl">
          <p className="text-gray-400 font-medium">No open bounties yet.</p>
          <p className="text-sm text-gray-400 mt-1">Be the first to post one!</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {bounties.map((b) => (
            <Link
              key={b.id}
              href={`/bounties/${b.id}`}
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
