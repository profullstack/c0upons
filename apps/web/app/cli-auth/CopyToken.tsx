'use client';

import { useState } from 'react';

export default function CopyToken({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard may be unavailable; user can still select the text */
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <pre className="bg-gray-900 text-green-300 text-xs rounded-xl p-4 overflow-x-auto whitespace-pre-wrap break-all select-all">
        {token}
      </pre>
      <button
        onClick={handleCopy}
        className={`self-start inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
          copied ? 'bg-green-500 text-white' : 'bg-gray-900 hover:bg-gray-700 text-white'
        }`}
      >
        {copied ? 'Copied ✓' : 'Copy code'}
      </button>
    </div>
  );
}
