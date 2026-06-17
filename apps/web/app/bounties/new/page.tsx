'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface Store { id: number; name: string; slug: string; }

export default function NewBountyPage() {
  const router = useRouter();
  const [did, setDid] = useState<string | null>(null);
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [useNewStore, setUseNewStore] = useState(false);

  const [form, setForm] = useState({
    title: '',
    description: '',
    url: '',
    reward_usd: '0.10',
    store_id: '',
    store_name: '',
  });

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(d => setDid(d.did ?? null)).catch(() => {});
    fetch('/api/stores').then(r => r.json()).then(d => setStores(Array.isArray(d) ? d : [])).catch(() => {});
  }, []);

  function set(k: string, v: string) { setForm(f => ({ ...f, [k]: v })); }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const reward = parseFloat(form.reward_usd);
    if (isNaN(reward) || reward < 0.10) { setError('Minimum reward is $0.10'); return; }
    if (!form.store_id && !form.store_name.trim()) { setError('Please select or name a store'); return; }
    if (!form.title.trim()) { setError('Title is required'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/bounties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description.trim() || null,
          url: form.url.trim() || null,
          reward_usd: reward,
          store_id: form.store_id ? parseInt(form.store_id) : null,
          store_name: !form.store_id ? form.store_name.trim() : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Failed to create bounty'); return; }
      // If CoinPay returned a payment URL, redirect there to fund the bounty
      if (data.pay_url) {
        window.location.href = data.pay_url;
      } else {
        router.push(`/bounties/${data.id}`);
      }
    } catch { setError('Something went wrong. Please try again.'); }
    finally { setLoading(false); }
  }

  if (!did) {
    return (
      <div className="max-w-lg mx-auto text-center py-20">
        <h1 className="text-2xl font-black text-gray-900 mb-3">Connect to post a bounty</h1>
        <p className="text-gray-500 mb-6">You need a CoinPay account to post and fund bounties.</p>
        <a
          href="/api/auth/coinpay?returnTo=/bounties/new"
          className="inline-flex items-center gap-2 bg-gray-900 hover:bg-gray-700 text-white font-semibold px-6 py-3 rounded-xl transition-colors"
        >
          Connect with CoinPay
        </a>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-3xl font-black text-gray-900 mb-8">Post a Bounty</h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        {/* Store */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 flex flex-col gap-4">
          <h2 className="font-bold text-gray-800">Store</h2>
          <div className="flex gap-3">
            {['existing', 'new'].map(mode => (
              <button
                key={mode}
                type="button"
                onClick={() => setUseNewStore(mode === 'new')}
                className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  (mode === 'new') === useNewStore
                    ? 'bg-orange-500 text-white border-orange-500'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-orange-300'
                }`}
              >
                {mode === 'existing' ? 'Existing store' : 'Other store'}
              </button>
            ))}
          </div>
          {!useNewStore ? (
            <select
              value={form.store_id}
              onChange={e => set('store_id', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-400"
              required={!useNewStore}
            >
              <option value="">Select a store…</option>
              {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          ) : (
            <input
              type="text"
              placeholder="Store name"
              value={form.store_name}
              onChange={e => set('store_name', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
          )}
        </div>

        {/* Bounty details */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 flex flex-col gap-4">
          <h2 className="font-bold text-gray-800">Bounty details</h2>
          <input
            type="text"
            placeholder="What coupon do you need? *"
            value={form.title}
            onChange={e => set('title', e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-400"
            required
          />
          <textarea
            placeholder="More details (optional) — e.g. minimum discount, exclusions"
            value={form.description}
            onChange={e => set('description', e.target.value)}
            rows={3}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none"
          />
          <input
            type="url"
            placeholder="Link (optional) — e.g. the product or store page"
            value={form.url}
            onChange={e => set('url', e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-400"
          />
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Reward amount (USD, min $0.10) *</label>
            <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-orange-400">
              <span className="px-3 text-gray-500 text-sm font-medium border-r border-gray-200 py-2">$</span>
              <input
                type="number"
                min="0.10"
                step="0.01"
                value={form.reward_usd}
                onChange={e => set('reward_usd', e.target.value)}
                className="flex-1 px-3 py-2 text-sm text-gray-900 focus:outline-none"
                required
              />
            </div>
            <p className="text-xs text-gray-400 mt-1">
              You will be redirected to CoinPay to fund this bounty. The reward is held until a valid coupon is submitted.
            </p>
          </div>
        </div>

        {error && (
          <p className="text-red-500 text-sm bg-red-50 border border-red-200 rounded-lg px-4 py-3">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-semibold px-6 py-3 rounded-xl transition-colors"
        >
          {loading ? 'Creating…' : 'Post Bounty & Pay'}
        </button>
      </form>
    </div>
  );
}
