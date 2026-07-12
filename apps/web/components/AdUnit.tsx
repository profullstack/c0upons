const AD_SLOT = '3cdc1ebf-cdad-4079-926a-5096837cf2b2';

/**
 * Renders a CrawlProof ad slot inline within page content.
 * The global crawlproof.com/ad.js loader (in app/layout.tsx) finds the
 * `data-cp-ad` element and fills it in place with a 300x250 iframe.
 */
export default function AdUnit({ className = '' }: { className?: string }) {
  return (
    <div className={`flex flex-col items-center ${className}`}>
      <span className="mb-2 text-[11px] font-medium uppercase tracking-widest text-gray-400">
        Advertisement
      </span>
      <div
        data-cp-ad=""
        data-slot={AD_SLOT}
        data-format="banner_300x250"
        style={{ minWidth: 300, minHeight: 250 }}
      />
    </div>
  );
}
