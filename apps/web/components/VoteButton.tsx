'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function VoteButton({
  couponId,
  initialVotes,
  voted = false,
}: {
  couponId: number;
  initialVotes: number;
  voted?: boolean;
}) {
  const [votes, setVotes] = useState(initialVotes);
  const [hasVoted, setHasVoted] = useState(voted);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleVote() {
    if (hasVoted || loading) return;
    setLoading(true);
    try {
      const res = await fetch('/api/coupons/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: couponId }),
      });

      if (res.status === 401) {
        // Not logged in — redirect to CoinPay OAuth
        window.location.href = `/api/auth/coinpay?returnTo=${encodeURIComponent(window.location.pathname)}`;
        return;
      }

      if (res.status === 409) {
        setHasVoted(true);
        return;
      }

      if (res.ok) {
        const data = await res.json();
        setVotes(data.votes);
        setHasVoted(true);
        router.refresh();
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleVote}
      disabled={hasVoted || loading}
      title={hasVoted ? 'Already voted' : 'Vote — connect with CoinPay'}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all border ${
        hasVoted
          ? 'bg-orange-50 text-orange-500 border-orange-200 cursor-default'
          : 'bg-white text-gray-500 border-gray-200 hover:bg-orange-50 hover:text-orange-500 hover:border-orange-300 active:scale-95'
      } ${loading ? 'opacity-50' : ''}`}
    >
      <svg
        className={`w-4 h-4 ${hasVoted ? 'fill-orange-400' : 'fill-none stroke-current'}`}
        viewBox="0 0 24 24"
        strokeWidth={2}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
      </svg>
      <span>{votes}</span>
    </button>
  );
}
