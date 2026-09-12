'use client';

import { useEffect, useState } from 'react';
import CopyButton from './CopyButton';

type State =
  | { phase: 'searching' }
  | { phase: 'found'; code: string }
  | { phase: 'none'; notes?: string }
  | { phase: 'unavailable' };

/**
 * The code-less coupon's call to action.
 *
 * The deal link shows at once, because that is what most visitors came for.
 * Underneath, the page asks the server to read the deal page with a browser
 * and click whatever reveals a code; when one turns up the copy button takes
 * the link's place. When none does, it says so, which is itself the answer a
 * shopper wanted: no code, the price applies at the link.
 */
export default function RevealCode({ couponId, url }: { couponId: number; url: string | null }) {
  const [state, setState] = useState<State>({ phase: 'searching' });

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    fetch(`/api/coupons/${couponId}/reveal`, { method: 'POST', signal: controller.signal })
      .then(async (res) => {
        if (cancelled) return;
        // 503 is "not configured" or "the model is out of quota"; any other
        // failure is equally not an answer, so the link stands on its own.
        if (!res.ok) return setState({ phase: 'unavailable' });
        const body = (await res.json().catch(() => ({}))) as { code?: string | null; notes?: string };
        if (body.code) setState({ phase: 'found', code: body.code });
        else setState({ phase: 'none', notes: body.notes });
      })
      .catch(() => {
        if (!cancelled) setState({ phase: 'unavailable' });
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [couponId]);

  return (
    <div className="flex flex-col gap-3">
      {state.phase === 'found' && <CopyButton code={state.code} />}
      {url && (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className={
            state.phase === 'found'
              ? 'text-center text-sm text-orange-500 hover:underline'
              : 'bg-orange-500 hover:bg-orange-600 text-white font-semibold px-6 py-3 rounded-lg text-center transition-colors'
          }
        >
          Get Deal
        </a>
      )}
      {state.phase === 'searching' && (
        <p className="text-sm text-gray-400" aria-live="polite">
          <span className="inline-block w-3 h-3 mr-2 rounded-full border-2 border-orange-400 border-t-transparent animate-spin align-middle" />
          Checking the deal page for a code…
        </p>
      )}
      {state.phase === 'none' && (
        <p className="text-sm text-gray-400">No code needed. The price applies at the link.</p>
      )}
    </div>
  );
}
