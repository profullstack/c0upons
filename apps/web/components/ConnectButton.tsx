'use client';

import { useEffect, useState } from 'react';

export default function ConnectButton() {
  const [did, setDid] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => r.json())
      .then((d) => setDid(d.did))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function disconnect() {
    await fetch('/api/auth/logout', { method: 'POST' });
    setDid(null);
  }

  if (loading) return <div className="w-28 h-7 bg-gray-100 rounded animate-pulse" />;

  if (did) {
    const short = `${did.slice(0, 12)}…${did.slice(-4)}`;
    return (
      <div className="flex items-center gap-2">
        <span
          className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded font-mono hidden lg:block"
          title={did}
        >
          {short}
        </span>
        <button
          onClick={disconnect}
          className="text-xs text-gray-400 hover:text-red-500 transition-colors"
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <a
      href="/api/auth/coinpay"
      className="flex items-center gap-1.5 text-xs font-medium bg-gray-900 hover:bg-gray-700 text-white px-3 py-1.5 rounded-lg transition-colors shrink-0"
    >
      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
      Connect
    </a>
  );
}
