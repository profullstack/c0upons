import Link from 'next/link';
import SearchBar from './SearchBar';

export default function Header() {
  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-6">
        <Link href="/" className="text-2xl font-black text-orange-500 tracking-tight shrink-0">
          c0upons
        </Link>
        <SearchBar />
        <nav className="hidden md:flex items-center gap-4 shrink-0 text-sm font-medium text-gray-600">
          <Link href="/" className="hover:text-orange-500 transition-colors">Coupons</Link>
          <Link href="/stores" className="hover:text-orange-500 transition-colors">Stores</Link>
          <Link href="/submit" className="bg-orange-500 hover:bg-orange-600 text-white px-3 py-1.5 rounded-lg transition-colors">
            Submit Code
          </Link>
        </nav>
      </div>
    </header>
  );
}
