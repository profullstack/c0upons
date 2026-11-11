'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function SearchBar({ defaultValue = '' }: { defaultValue?: string }) {
  const [q, setQ] = useState(defaultValue);
  const router = useRouter();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Read the field itself, not only state: a WebMCP agent fills the named input directly.
    const value = String(new FormData(e.currentTarget as HTMLFormElement).get('q') ?? q).trim();
    if (value) router.push(`/search?q=${encodeURIComponent(value)}`);
  };

  return (
    <form
      onSubmit={handleSubmit}
      action="/search"
      className="flex w-full max-w-xl"
      {...{ toolname: 'search_coupons_page', tooldescription: 'Search coupons by store, brand or code and show the results page', toolautosubmit: '' }}
    >
      <div className="flex flex-1 items-center border border-gray-300 rounded-l-xl bg-white focus-within:ring-2 focus-within:ring-orange-400 focus-within:border-orange-400 transition-all overflow-hidden">
        <svg className="w-4 h-4 ml-3 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          name="q"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search stores, brands, or codes…"
          className="flex-1 px-3 py-2.5 text-sm bg-transparent focus:outline-none text-gray-900 placeholder:text-gray-400"
        />
      </div>
      <button
        type="submit"
        className="bg-orange-500 hover:bg-orange-600 text-white font-semibold px-5 py-2.5 rounded-r-xl text-sm transition-colors shrink-0"
      >
        Search
      </button>
    </form>
  );
}
