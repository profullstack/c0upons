export const dynamic = 'force-dynamic';

import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { COOKIE, parseSession } from '@/lib/auth';
import CopyToken from './CopyToken';

export const metadata: Metadata = {
  title: 'CLI Login',
  robots: { index: false, follow: false },
};

export default async function CliAuthPage() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value ?? null;
  const did = token ? await parseSession(token) : null;

  return (
    <div className="max-w-lg mx-auto py-12">
      <h1 className="text-3xl font-black text-gray-900 mb-2">Connect the CLI</h1>

      {did && token ? (
        <>
          <p className="text-gray-500 mb-6 text-sm">
            You&apos;re signed in as <span className="font-mono text-gray-700">{did.slice(0, 20)}…</span>.
            Copy the code below and paste it back into your terminal.
          </p>
          <CopyToken token={token} />
          <p className="text-xs text-gray-400 mt-6">
            Treat this code like a password — it grants access to post coupons and bounties as you for
            30 days. Run <code className="font-mono">c0upons logout</code> on your machine to forget it.
          </p>
        </>
      ) : (
        <>
          <p className="text-gray-500 mb-6 text-sm">
            Sign in with CoinPay, then you&apos;ll get a code to paste into the CLI.
          </p>
          <a
            href="/api/auth/coinpay?returnTo=/cli-auth"
            className="inline-flex items-center gap-2 bg-gray-900 hover:bg-gray-700 text-white font-semibold px-6 py-3 rounded-xl transition-colors"
          >
            Connect with CoinPay
          </a>
        </>
      )}
    </div>
  );
}
