'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface Store {
  id: number;
  name: string;
  slug: string;
}

export default function SubmitPage() {
  const router = useRouter();
  const [stores, setStores] = useState<Store[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const [form, setForm] = useState({
    store_id: '',
    new_store_name: '',
    new_store_website: '',
    code: '',
    title: '',
    description: '',
    discount: '',
    expiry_date: '',
    url: '',
  });

  const [useNewStore, setUseNewStore] = useState(false);

  useEffect(() => {
    fetch('/api/stores')
      .then((r) => r.json())
      .then((data) => setStores(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  function set(field: string, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      let storeId = parseInt(form.store_id);

      if (useNewStore) {
        if (!form.new_store_name.trim()) {
          setError('Store name is required.');
          setLoading(false);
          return;
        }
        const slug = form.new_store_name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, '');
        const storeRes = await fetch('/api/stores', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: form.new_store_name.trim(),
            slug,
            website: form.new_store_website.trim() || null,
          }),
        });
        if (!storeRes.ok) {
          const d = await storeRes.json();
          setError(d.error ?? 'Failed to create store.');
          setLoading(false);
          return;
        }
        const storesRes = await fetch(`/api/stores`);
        const allStores: Store[] = await storesRes.json();
        const created = allStores.find((s) => s.slug === slug);
        if (!created) {
          setError('Store was created but could not be found.');
          setLoading(false);
          return;
        }
        storeId = created.id;
      }

      if (!storeId) {
        setError('Please select or create a store.');
        setLoading(false);
        return;
      }
      if (!form.title.trim()) {
        setError('Title is required.');
        setLoading(false);
        return;
      }

      const res = await fetch('/api/coupons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          store_id: storeId,
          code: form.code.trim() || null,
          title: form.title.trim(),
          description: form.description.trim() || null,
          discount: form.discount.trim() || null,
          expiry_date: form.expiry_date || null,
          url: form.url.trim() || null,
        }),
      });

      if (!res.ok) {
        const d = await res.json();
        setError(d.error ?? 'Failed to submit coupon.');
        setLoading(false);
        return;
      }

      setSuccess(true);
      setTimeout(() => router.push('/'), 2000);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="max-w-lg mx-auto text-center py-20">
        <div className="text-4xl mb-4">🎉</div>
        <h1 className="text-2xl font-black text-gray-900">Coupon submitted!</h1>
        <p className="text-gray-500 mt-2">Redirecting you to the homepage…</p>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-3xl font-black text-gray-900 mb-8">Submit a Coupon</h1>

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        <div className="bg-white border border-gray-200 rounded-2xl p-6 flex flex-col gap-4">
          <h2 className="font-bold text-gray-800">Store</h2>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setUseNewStore(false)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                !useNewStore
                  ? 'bg-orange-500 text-white border-orange-500'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-orange-300'
              }`}
            >
              Existing store
            </button>
            <button
              type="button"
              onClick={() => setUseNewStore(true)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                useNewStore
                  ? 'bg-orange-500 text-white border-orange-500'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-orange-300'
              }`}
            >
              Add new store
            </button>
          </div>

          {!useNewStore ? (
            <select
              value={form.store_id}
              onChange={(e) => set('store_id', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-400"
              required={!useNewStore}
            >
              <option value="">Select a store…</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          ) : (
            <div className="flex flex-col gap-3">
              <input
                type="text"
                placeholder="Store name *"
                value={form.new_store_name}
                onChange={(e) => set('new_store_name', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
              <input
                type="url"
                placeholder="Website URL (optional)"
                value={form.new_store_website}
                onChange={(e) => set('new_store_website', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
            </div>
          )}
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-6 flex flex-col gap-4">
          <h2 className="font-bold text-gray-800">Coupon details</h2>

          <input
            type="text"
            placeholder="Title * (e.g. 20% off sitewide)"
            value={form.title}
            onChange={(e) => set('title', e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-400"
            required
          />

          <div className="flex gap-3">
            <input
              type="text"
              placeholder="Coupon code (optional)"
              value={form.code}
              onChange={(e) => set('code', e.target.value)}
              className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 font-mono focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
            <input
              type="text"
              placeholder="Discount (e.g. 20%)"
              value={form.discount}
              onChange={(e) => set('discount', e.target.value)}
              className="w-32 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
          </div>

          <textarea
            placeholder="Description (optional)"
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
            rows={3}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none"
          />

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="text-xs text-gray-500 mb-1 block">Expiry date (optional)</label>
              <input
                type="date"
                value={form.expiry_date}
                onChange={(e) => set('expiry_date', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
            </div>
            <div className="flex-1">
              <label className="text-xs text-gray-500 mb-1 block">Deal URL (optional)</label>
              <input
                type="url"
                placeholder="https://…"
                value={form.url}
                onChange={(e) => set('url', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
            </div>
          </div>
        </div>

        {error && (
          <p className="text-red-500 text-sm bg-red-50 border border-red-200 rounded-lg px-4 py-3">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-semibold px-6 py-3 rounded-xl transition-colors"
        >
          {loading ? 'Submitting…' : 'Submit Coupon'}
        </button>
      </form>
    </div>
  );
}
