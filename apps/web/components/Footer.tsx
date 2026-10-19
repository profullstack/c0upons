import Image from 'next/image';
import Link from 'next/link';

const LINKS: [string, string][] = [
  ['/stores', 'Stores'],
  ['/submit', 'Submit a code'],
  ['/blog', 'Blog'],
  ['/docs', 'Docs & API'],
  ['/about', 'About'],
  ['/privacy', 'Privacy'],
  ['/terms', 'Terms'],
];

export default function Footer() {
  return (
    <footer className="bg-gray-900 text-gray-400 mt-20">
      <div className="max-w-7xl mx-auto px-4 py-6 flex flex-col md:flex-row md:items-center md:justify-between gap-3 text-sm">
        <div className="flex items-center gap-3">
          <Link href="/" className="inline-block">
            <Image src="/logo.svg" alt="c0upons" width={104} height={22} unoptimized className="h-[22px] w-auto" />
          </Link>
          <span>&copy; {new Date().getFullYear()} Profullstack, Inc.</span>
        </div>
        <nav className="flex flex-wrap gap-x-4 gap-y-1" aria-label="Footer">
          {LINKS.map(([href, label]) => (
            <Link key={href} href={href} className="hover:text-white transition-colors">{label}</Link>
          ))}
          <a href="https://github.com/profullstack/c0upons" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">
            GitHub
          </a>
        </nav>
      </div>
    </footer>
  );
}
