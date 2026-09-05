/**
 * Every blog page carries one CrawlProof unit under the post: the text strip,
 * filled by the ad.js loader the root layout already includes. It collapses
 * to nothing when there is no advertiser. Same slot as components/AdUnit.
 */
export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <aside data-cp-ad="" data-slot="3cdc1ebf-cdad-4079-926a-5096837cf2b2" data-format="text_link" />
    </>
  );
}
