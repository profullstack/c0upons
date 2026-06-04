'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function SearchBar({ defaultValue = '' }: { defaultValue?: string }) {
  const [q, setQ] = useState(defaultValue);
  const router = useRouter();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (q.trim()) router.push(`/search?q=${encodeURIComponent(q.trim())}`);
  };

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-xl">
      <input
        type="text"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search stores, brands, or coupon codes..."
        className="flex-1 border border-gray-300 rounded-l-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
      />
      <button
        type="submit"
        className="bg-orange-500 hover:bg-orange-600 text-white font-semibold px-5 py-2.5 rounded-r-lg text-sm transition-colors"
      >
        Search
      </button>
    </form>
  );
}
