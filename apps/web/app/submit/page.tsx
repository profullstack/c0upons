'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Scraped {
  title: string;
  description: string;
  store_name: string;
  store_website: string;
  image_url: string;
  category: string;
}

const EMPTY: Scraped = {
  title: '',
  description: '',
  store_name: '',
  store_website: '',
  image_url: '',
  category: '',
};

export default function SubmitPage() {
  const router = useRouter();

  const [url, setUrl] = useState('');
  const [code, setCode] = useState('');
  const [discountType, setDiscountType] = useState<'percent' | 'fixed'>('percent');
  const [discountValue, setDiscountValue] = useState('');
  const [expiryDate, setExpiryDate] = useState('');

  const [scraped, setScraped] = useState<Scraped | null>(null);
  const [scraping, setScraping] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  function setField(field: keyof Scraped, value: string) {
    setScraped((s) => ({ ...(s ?? EMPTY), [field]: value }));
  }

  async function handleFetch() {
    setError('');
    if (!url.trim()) {
      setError('Paste a product URL first.');
      return;
    }
    setScraping(true);
    try {
      const res = await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Could not read that page. You can fill the details in manually.');
        setScraped({ ...EMPTY });
        return;
      }
      setScraped({
        title: data.title ?? '',
        description: data.description ?? '',
        store_name: data.store_name ?? '',
        store_website: data.store_website ?? '',
        image_url: data.image_url ?? '',
        category: data.category ?? '',
      });
    } catch {
      setError('Could not read that page. You can fill the details in manually.');
      setScraped({ ...EMPTY });
    } finally {
      setScraping(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!url.trim()) {
      setError('A product URL is required.');
      return;
    }
    if (!scraped || !scraped.title.trim()) {
      setError('Fetch the listing details first (or add a title).');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/coupons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: url.trim(),
          code: code.trim() || null,
          discount_type: discountValue.trim() ? discountType : null,
          discount_value: discountValue.trim() || null,
          expiry_date: expiryDate || null,
          title: scraped.title.trim(),
          description: scraped.description.trim() || null,
          store_name: scraped.store_name.trim() || null,
          store_website: scraped.store_website.trim() || null,
          image_url: scraped.image_url.trim() || null,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error ?? 'Failed to submit coupon.');
        return;
      }
      setSuccess(true);
      setTimeout(() => router.push('/'), 1800);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
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

  const inputClass =
    'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-400';

  return (
    <div className="max-w-lg mx-auto">
      <h1 className="text-3xl font-black text-gray-900 mb-2">Submit a Coupon</h1>
      <p className="text-gray-500 mb-8 text-sm">
        Paste the product link and your coupon code — we&apos;ll pull the listing details for you.
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-6">
        {/* Product URL + fetch */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 flex flex-col gap-4">
          <h2 className="font-bold text-gray-800">Product link</h2>
          <div className="flex gap-2">
            <input
              type="url"
              placeholder="https://store.com/product/…"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className={`flex-1 ${inputClass}`}
              required
            />
            <button
              type="button"
              onClick={handleFetch}
              disabled={scraping}
              className="shrink-0 bg-gray-900 hover:bg-gray-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
            >
              {scraping ? 'Reading…' : 'Fetch details'}
            </button>
          </div>
          <p className="text-xs text-gray-400">
            We use AI to read the title, store, and image from the page. You can edit anything below.
          </p>
        </div>

        {/* AI-scraped, editable preview */}
        {scraped && (
          <div className="bg-white border border-gray-200 rounded-2xl p-6 flex flex-col gap-4">
            <h2 className="font-bold text-gray-800">Listing details</h2>
            <div className="flex gap-4">
              {scraped.image_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={scraped.image_url}
                  alt=""
                  className="w-20 h-20 rounded-lg object-cover border border-gray-100 shrink-0"
                />
              ) : (
                <div className="w-20 h-20 rounded-lg bg-orange-50 border border-orange-100 flex items-center justify-center text-orange-300 text-2xl shrink-0">
                  🏷️
                </div>
              )}
              <div className="flex-1 flex flex-col gap-2">
                <input
                  type="text"
                  placeholder="Title *"
                  value={scraped.title}
                  onChange={(e) => setField('title', e.target.value)}
                  className={inputClass}
                  required
                />
                <input
                  type="text"
                  placeholder="Store name"
                  value={scraped.store_name}
                  onChange={(e) => setField('store_name', e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
            <textarea
              placeholder="Description"
              value={scraped.description}
              onChange={(e) => setField('description', e.target.value)}
              rows={2}
              className={`${inputClass} resize-none`}
            />
          </div>
        )}

        {/* Coupon details */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 flex flex-col gap-4">
          <h2 className="font-bold text-gray-800">Coupon</h2>
          <input
            type="text"
            placeholder="Coupon code (optional)"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className={`${inputClass} font-mono`}
          />

          <div className="flex gap-3">
            <div className="flex rounded-lg border border-gray-200 overflow-hidden">
              <button
                type="button"
                onClick={() => setDiscountType('percent')}
                className={`px-3 py-2 text-sm font-medium transition-colors ${
                  discountType === 'percent'
                    ? 'bg-orange-500 text-white'
                    : 'bg-white text-gray-600 hover:bg-orange-50'
                }`}
              >
                % off
              </button>
              <button
                type="button"
                onClick={() => setDiscountType('fixed')}
                className={`px-3 py-2 text-sm font-medium transition-colors ${
                  discountType === 'fixed'
                    ? 'bg-orange-500 text-white'
                    : 'bg-white text-gray-600 hover:bg-orange-50'
                }`}
              >
                $ off
              </button>
            </div>
            <input
              type="number"
              min="0"
              step="any"
              placeholder={discountType === 'percent' ? 'e.g. 20' : 'e.g. 15'}
              value={discountValue}
              onChange={(e) => setDiscountValue(e.target.value)}
              className={`flex-1 ${inputClass}`}
            />
          </div>

          <div>
            <label className="text-xs text-gray-500 mb-1 block">Expires on (optional)</label>
            <input
              type="date"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
              className={inputClass}
            />
          </div>
        </div>

        {error && (
          <p className="text-red-500 text-sm bg-red-50 border border-red-200 rounded-lg px-4 py-3">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting || !scraped}
          className="bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-semibold px-6 py-3 rounded-xl transition-colors"
        >
          {submitting ? 'Submitting…' : 'Submit Coupon'}
        </button>
      </form>
    </div>
  );
}
