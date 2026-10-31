import { Footer as ProfullstackFooter } from '@profullstack/footer/react';

export default function Footer() {
  return (
    <div className="bg-gray-900 text-gray-400 mt-20">
      <ProfullstackFooter
        site="https://c0upons.com/"
        tagline="Community-powered coupon codes and deals."
        links={[
          { label: 'Stores', href: '/stores' },
          { label: 'Submit a code', href: '/submit' },
          { label: 'Blog', href: '/blog' },
          { label: 'Docs & API', href: '/docs' },
          { label: 'About', href: '/about' },
          { label: 'Privacy', href: '/privacy' },
          { label: 'Terms', href: '/terms' },
          { label: 'GitHub', href: 'https://github.com/profullstack/c0upons', rel: 'noopener noreferrer' },
        ]}
      />
    </div>
  );
}
