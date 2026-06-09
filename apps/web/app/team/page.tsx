import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Team & Company',
  description:
    'Meet the team behind c0upons — built by Profullstack, Inc., a software studio focused on open-source developer tools and community platforms.',
  alternates: { canonical: 'https://c0upons.com/team' },
  openGraph: {
    title: 'Team & Company — c0upons',
    description:
      'Meet the team behind c0upons — built by Profullstack, Inc., a software studio focused on open-source developer tools and community platforms.',
    url: 'https://c0upons.com/team',
  },
};

const teamMembers = [
  {
    name: 'Anthony Lam',
    title: 'Founder & CEO',
    bio: 'Anthony founded Profullstack, Inc. with a focus on building practical, open-source developer tools and community-first platforms. He leads product direction, engineering, and growth for c0upons.',
    email: 'anthony@profullstack.com',
    github: 'https://github.com/profullstack',
  },
];

export default function TeamPage() {
  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-10">
      <div>
        <h1 className="text-3xl font-black text-gray-900">Team &amp; Company</h1>
        <p className="text-gray-500 mt-2">The people and mission behind c0upons.</p>
      </div>

      {/* Company background */}
      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-bold text-gray-900 border-b border-gray-200 pb-2">About Profullstack, Inc.</h2>
        <p className="text-gray-600 leading-relaxed">
          c0upons is built and maintained by{' '}
          <a
            href="https://profullstack.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-orange-500 hover:underline font-medium"
          >
            Profullstack, Inc.
          </a>
          , a software studio dedicated to creating open-source tools that put communities first.
          Founded on the belief that great software should be transparent, accessible, and free
          from unnecessary friction, Profullstack ships products used by developers and consumers
          worldwide.
        </p>
        <p className="text-gray-600 leading-relaxed">
          Our projects span community platforms, developer utilities, and consumer-facing apps —
          all released under permissive open-source licenses whenever possible. We are a
          fully-remote, independent company with no outside investors.
        </p>
        <div className="flex flex-col gap-1 text-sm text-gray-600 bg-gray-50 rounded-xl px-5 py-4 border border-gray-100">
          <p><span className="font-semibold text-gray-800">Company:</span> Profullstack, Inc.</p>
          <p><span className="font-semibold text-gray-800">Website:</span>{' '}
            <a href="https://profullstack.com" target="_blank" rel="noopener noreferrer" className="text-orange-500 hover:underline">
              profullstack.com
            </a>
          </p>
          <p><span className="font-semibold text-gray-800">GitHub:</span>{' '}
            <a href="https://github.com/profullstack" target="_blank" rel="noopener noreferrer" className="text-orange-500 hover:underline">
              github.com/profullstack
            </a>
          </p>
          <p><span className="font-semibold text-gray-800">General inquiries:</span>{' '}
            <a href="mailto:anthony@profullstack.com" className="text-orange-500 hover:underline">
              anthony@profullstack.com
            </a>
          </p>
        </div>
      </section>

      {/* Team */}
      <section className="flex flex-col gap-6">
        <h2 className="text-xl font-bold text-gray-900 border-b border-gray-200 pb-2">Our Team</h2>
        <ul className="flex flex-col gap-6">
          {teamMembers.map((member) => (
            <li
              key={member.name}
              className="flex gap-5 items-start bg-gray-50 border border-gray-100 rounded-xl p-5"
            >
              {/* Avatar placeholder */}
              <div className="w-14 h-14 rounded-full bg-orange-100 flex items-center justify-center shrink-0 text-orange-500 font-black text-xl select-none">
                {member.name
                  .split(' ')
                  .map((n) => n[0])
                  .join('')}
              </div>
              <div className="flex flex-col gap-1">
                <p className="font-bold text-gray-900 text-lg leading-tight">{member.name}</p>
                <p className="text-sm font-semibold text-orange-500">{member.title}</p>
                <p className="text-gray-600 text-sm leading-relaxed mt-1">{member.bio}</p>
                <div className="flex gap-4 mt-2 text-sm">
                  <a
                    href={`mailto:${member.email}`}
                    className="text-orange-500 hover:underline font-medium"
                  >
                    {member.email}
                  </a>
                  <a
                    href={member.github}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gray-500 hover:text-gray-800 transition-colors font-medium"
                  >
                    GitHub ↗
                  </a>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* Press / partnership */}
      <section className="flex flex-col gap-4">
        <h2 className="text-xl font-bold text-gray-900 border-b border-gray-200 pb-2">Press &amp; Partnerships</h2>
        <p className="text-gray-600 leading-relaxed">
          For press inquiries, partnership opportunities, or media assets, please reach out directly:
        </p>
        <ul className="flex flex-col gap-2 text-sm text-gray-600">
          <li>
            <span className="font-semibold text-gray-800">Press &amp; media:</span>{' '}
            <a href="mailto:anthony@profullstack.com" className="text-orange-500 hover:underline">
              anthony@profullstack.com
            </a>
          </li>
          <li>
            <span className="font-semibold text-gray-800">Partnerships:</span>{' '}
            <a href="mailto:anthony@profullstack.com" className="text-orange-500 hover:underline">
              anthony@profullstack.com
            </a>
          </li>
          <li>
            <span className="font-semibold text-gray-800">Open-source contributions:</span>{' '}
            <a
              href="https://github.com/profullstack/c0upons"
              target="_blank"
              rel="noopener noreferrer"
              className="text-orange-500 hover:underline"
            >
              github.com/profullstack/c0upons ↗
            </a>
          </li>
        </ul>
      </section>

      <div className="flex gap-4">
        <Link
          href="/about"
          className="bg-orange-500 hover:bg-orange-600 text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition-colors"
        >
          About c0upons
        </Link>
        <Link
          href="/"
          className="border border-gray-200 hover:border-gray-300 text-gray-700 font-semibold px-5 py-2.5 rounded-xl text-sm transition-colors"
        >
          Browse coupons
        </Link>
      </div>
    </div>
  );
}
