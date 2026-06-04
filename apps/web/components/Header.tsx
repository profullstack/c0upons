'use client';

import Link from 'next/link';
import { useState } from 'react';
import SearchBar from './SearchBar';

export default function Header() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-4">
        <Link href="/" className="text-2xl font-black text-orange-500 tracking-tight shrink-0">
          c0upons
        </Link>
        <div className="flex-1 hidden sm:block">
          <SearchBar />
        </div>
        <nav className="hidden md:flex items-center gap-4 shrink-0 text-sm font-medium text-gray-600">
          <Link href="/" className="hover:text-orange-500 transition-colors">Coupons</Link>
          <Link href="/stores" className="hover:text-orange-500 transition-colors">Stores</Link>
          <Link href="/submit" className="bg-orange-500 hover:bg-orange-600 text-white px-3 py-1.5 rounded-lg transition-colors">
            Submit Code
          </Link>
        </nav>
        {/* Hamburger — mobile only */}
        <button
          className="md:hidden ml-auto p-2 rounded-lg hover:bg-gray-100 transition-colors"
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

      {/* Mobile search row */}
      <div className="sm:hidden px-4 pb-3">
        <SearchBar />
      </div>

      {/* Mobile dropdown menu */}
      {menuOpen && (
        <div className="md:hidden border-t border-gray-100 bg-white px-4 py-3 flex flex-col gap-3 text-sm font-medium text-gray-700">
          <Link href="/" className="hover:text-orange-500 transition-colors" onClick={() => setMenuOpen(false)}>
            Coupons
          </Link>
          <Link href="/stores" className="hover:text-orange-500 transition-colors" onClick={() => setMenuOpen(false)}>
            Stores
          </Link>
          <Link
            href="/submit"
            className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg text-center transition-colors"
            onClick={() => setMenuOpen(false)}
          >
            Submit Code
          </Link>
        </div>
      )}
    </header>
  );
}
