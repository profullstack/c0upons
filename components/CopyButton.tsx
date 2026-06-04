'use client';

import { useState } from 'react';

export default function CopyButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-semibold px-4 py-2 rounded-lg transition-colors text-sm"
    >
      <span className="border border-white/40 rounded px-2 py-0.5 font-mono text-xs tracking-widest">
        {code}
      </span>
      <span>{copied ? 'Copied!' : 'Copy'}</span>
    </button>
  );
}
