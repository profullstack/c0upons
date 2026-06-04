import Link from 'next/link';

export default function Footer() {
  return (
    <footer className="bg-gray-50 border-t border-gray-200 mt-16">
      <div className="max-w-7xl mx-auto px-4 py-10 flex flex-col md:flex-row justify-between gap-6 text-sm text-gray-500">
        <div>
          <span className="text-lg font-black text-orange-500">c0upons</span>
          <p className="mt-1 text-xs">Save more with community-shared coupon codes.</p>
        </div>
        <div className="flex gap-8">
          <div className="flex flex-col gap-2">
            <span className="font-semibold text-gray-700">Browse</span>
            <Link href="/" className="hover:text-orange-500">Home</Link>
            <Link href="/stores" className="hover:text-orange-500">Stores</Link>
          </div>
          <div className="flex flex-col gap-2">
            <span className="font-semibold text-gray-700">Help</span>
            <Link href="/submit" className="hover:text-orange-500">Submit a Code</Link>
            <Link href="/about" className="hover:text-orange-500">About</Link>
          </div>
        </div>
        <p className="text-xs self-end">© {new Date().getFullYear()} c0upons</p>
      </div>
    </footer>
  );
}
