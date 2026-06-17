export const dynamic = 'force-dynamic';

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getDb } from '@/lib/db';
import { getSessionDid } from '@/lib/auth';
import BountyClaim from './BountyClaim';

interface Bounty {
  id: number;
  public_id: string;
  title: string;
  description: string | null;
  url: string | null;
  reward_usd: number;
  status: string;
  store_id: number | null;
  store_name: string | null;
  display_store: string | null;
  creator_did: string;
  claimer_did: string | null;
  coupon_code: string | null;
  coupon_title: string | null;
  payment_id: string | null;
  created_at: string;
}

// Look up by public_id. We intentionally do NOT swallow DB errors here: a
// thrown query (e.g. paused DB node) must surface as an error, not a 404 —
// otherwise a real, existing bounty gets reported as "not found".
async function getBounty(publicId: string): Promise<Bounty | null> {
  const db = getDb();
  const rows = await db.sql`
    SELECT b.*, COALESCE(s.name, b.store_name) AS display_store,
           c.code AS coupon_code, c.title AS coupon_title
    FROM bounties b
    LEFT JOIN stores s ON s.id = b.store_id
    LEFT JOIN coupons c ON c.id = b.coupon_id
    WHERE b.public_id = ${publicId}
  `;
  return rows.length ? rows[0] : null;
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const bounty = await getBounty(id);
  if (!bounty) return { title: 'Bounty not found' };
  return {
    title: `Bounty: ${bounty.title}`,
    description: `$${bounty.reward_usd.toFixed(2)} reward for a ${bounty.display_store ?? 'store'} coupon code.`,
  };
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  open: { label: 'Open — unfunded', color: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
  funded: { label: 'Funded — awaiting claim', color: 'bg-green-50 text-green-700 border-green-200' },
  claimed: { label: 'Claimed — processing payout', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  paid: { label: 'Paid', color: 'bg-gray-100 text-gray-500 border-gray-200' },
  cancelled: { label: 'Cancelled', color: 'bg-red-50 text-red-500 border-red-200' },
};

const COINPAY_BASE = 'https://coinpayportal.com';

export default async function BountyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [bounty, did] = await Promise.all([getBounty(id), getSessionDid()]);
  if (!bounty) notFound();

  const status = STATUS_LABELS[bounty.status] ?? { label: bounty.status, color: 'bg-gray-100 text-gray-600 border-gray-200' };
  const shortDid = (d: string) => `${d.slice(0, 16)}…${d.slice(-4)}`;
  const isCreator = did === bounty.creator_did;
  const isClaimer = did === bounty.claimer_did;
  const canClaim = did && !isCreator && ['open', 'funded'].includes(bounty.status);

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-8">
      <Link href="/bounties" className="text-sm text-orange-500 hover:underline">← All bounties</Link>

      <div className="bg-white border border-gray-200 rounded-2xl p-8 flex flex-col gap-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <h1 className="text-2xl font-black text-gray-900 leading-tight">{bounty.title}</h1>
            {bounty.display_store && (
              <p className="text-orange-500 font-medium mt-1">{bounty.display_store}</p>
            )}
          </div>
          <div className="text-right shrink-0">
            <div className="text-3xl font-black text-orange-500">${bounty.reward_usd.toFixed(2)}</div>
            <div className="text-xs text-gray-400 mt-0.5">reward</div>
          </div>
        </div>

        {/* Status */}
        <div className="flex items-center gap-2">
          <span className={`text-xs font-semibold border px-3 py-1 rounded-full ${status.color}`}>
            {status.label}
          </span>
        </div>

        {/* Description */}
        {bounty.description && (
          <p className="text-gray-600 leading-relaxed border-t border-gray-100 pt-4">{bounty.description}</p>
        )}

        {/* Reference link */}
        {bounty.url && (
          <a
            href={bounty.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-orange-500 hover:underline break-all"
          >
            {bounty.url} ↗
          </a>
        )}

        {/* Claimed coupon */}
        {bounty.coupon_code && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4">
            <p className="text-xs font-semibold text-green-700 mb-1">Winning coupon</p>
            <p className="font-black text-lg text-gray-900 font-mono">{bounty.coupon_code}</p>
            {bounty.coupon_title && <p className="text-sm text-gray-600 mt-0.5">{bounty.coupon_title}</p>}
          </div>
        )}

        {/* Meta */}
        <div className="border-t border-gray-100 pt-4 flex flex-col gap-2 text-xs text-gray-400">
          <p>Posted by <span className="font-mono">{shortDid(bounty.creator_did)}</span></p>
          {bounty.claimer_did && (
            <p>Claimed by <span className="font-mono">{shortDid(bounty.claimer_did)}</span></p>
          )}
          <p>{new Date(bounty.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>

        {/* Actions */}
        {bounty.status === 'open' && isCreator && bounty.payment_id && (
          <a
            href={`${COINPAY_BASE}/pay/${bounty.payment_id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full text-center bg-orange-500 hover:bg-orange-600 text-white font-semibold px-6 py-3 rounded-xl transition-colors"
          >
            Fund this bounty via CoinPay →
          </a>
        )}

        {canClaim && (
          <BountyClaim bountyPublicId={bounty.public_id} storeId={bounty.store_id} />
        )}

        {!did && ['open', 'funded'].includes(bounty.status) && (
          <a
            href={`/api/auth/coinpay?returnTo=/bounties/${bounty.public_id}`}
            className="w-full text-center bg-gray-900 hover:bg-gray-700 text-white font-semibold px-6 py-3 rounded-xl transition-colors"
          >
            Connect with CoinPay to claim
          </a>
        )}

        {isClaimer && bounty.status === 'claimed' && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-700">
            You claimed this bounty! Payment is being processed to your CoinPay wallet.
          </div>
        )}
      </div>
    </div>
  );
}
