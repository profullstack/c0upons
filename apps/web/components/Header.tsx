'use client';

import Link from 'next/link';
import { useState } from 'react';
import SearchBar from './SearchBar';
import ConnectButton from './ConnectButton';

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center gap-4">
        <Link href="/" className="flex items-center gap-2 shrink-0">
          <span className="text-xl font-black text-orange-500 tracking-tight">c0upons</span>
        </Link>

        <div className="flex-1 hidden sm:block">
          <SearchBar />
        </div>

        <nav className="hidden md:flex items-center gap-1 shrink-0 text-sm font-medium">
          <Link href="/" className="px-3 py-1.5 rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors">
            Coupons
          </Link>
          <Link href="/stores" className="px-3 py-1.5 rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors">
            Stores
          </Link>
          <Link href="/docs" className="px-3 py-1.5 rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors">
            Docs
          </Link>
          <Link
            href="/submit"
            className="ml-2 bg-orange-500 hover:bg-orange-600 text-white px-4 py-1.5 rounded-lg transition-colors font-semibold"
          >
            Submit
          </Link>
          <div className="ml-2">
            <ConnectButton />
          </div>
        </nav>

        <button
          className="md:hidden ml-auto p-2 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
          aria-label="Toggle menu"
          onClick={() => setMenuOpen((o) => !o)}
        >
          {menuOpen ? (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>
      </div>

      <div className="sm:hidden px-4 pb-3">
        <SearchBar />
      </div>

      {menuOpen && (
        <div className="md:hidden border-t border-gray-100 bg-white px-4 py-4 flex flex-col gap-2 text-sm font-medium">
          <Link href="/" className="px-3 py-2 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors" onClick={() => setMenuOpen(false)}>
            Coupons
          </Link>
          <Link href="/stores" className="px-3 py-2 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors" onClick={() => setMenuOpen(false)}>
            Stores
          </Link>
          <Link href="/docs" className="px-3 py-2 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors" onClick={() => setMenuOpen(false)}>
            Docs
          </Link>
          <Link
            href="/submit"
            className="px-3 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-center transition-colors font-semibold"
            onClick={() => setMenuOpen(false)}
          >
            Submit a Code
          </Link>
          <div className="pt-1">
            <ConnectButton />
          </div>
        </div>
      )}
    </header>
  );
}
