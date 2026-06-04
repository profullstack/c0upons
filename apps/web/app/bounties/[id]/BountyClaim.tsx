'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface Coupon { id: number; title: string; code: string | null; }

export default function BountyClaim({ bountyId, storeId }: { bountyId: number; storeId: number | null }) {
  const router = useRouter();
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    const url = storeId ? `/api/coupons?store_id=${storeId}` : '/api/coupons';
    fetch(url).then(r => r.json()).then(d => setCoupons(Array.isArray(d) ? d.slice(0, 50) : [])).catch(() => {});
  }, [storeId]);

  async function handleClaim() {
    if (!selectedId) { setError('Select a coupon to claim'); return; }
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`/api/bounties/${bountyId}/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coupon_id: parseInt(selectedId) }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Failed to claim'); return; }
      setSuccess(data.message ?? 'Bounty claimed!');
      setTimeout(() => router.refresh(), 2000);
    } catch { setError('Something went wrong.'); }
    finally { setLoading(false); }
  }

  if (success) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-sm text-green-700 font-medium">
        {success}
      </div>
    );
  }

  return (
    <div className="border-t border-gray-100 pt-4 flex flex-col gap-3">
      <p className="text-sm font-semibold text-gray-800">Claim this bounty</p>
      <p className="text-xs text-gray-500">
        Select a coupon you submitted for this store. If your coupon is accepted, the reward will be
        sent to your CoinPay wallet.
      </p>

      <select
        value={selectedId}
        onChange={e => setSelectedId(e.target.value)}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-400"
      >
        <option value="">Select a coupon you submitted…</option>
        {coupons.map(c => (
          <option key={c.id} value={c.id}>
            {c.code ? `${c.code} — ` : ''}{c.title}
          </option>
        ))}
      </select>

      {error && <p className="text-red-500 text-xs">{error}</p>}

      <button
        onClick={handleClaim}
        disabled={loading || !selectedId}
        className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-semibold px-4 py-2.5 rounded-xl text-sm transition-colors"
      >
        {loading ? 'Claiming…' : `Claim $${''} reward`}
      </button>
    </div>
  );
}
