import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'Terms of service for c0upons.com — rules for using and contributing to the platform.',
  alternates: { canonical: 'https://c0upons.com/terms' },
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-bold text-gray-900 border-b border-gray-200 pb-2">{title}</h2>
      <div className="flex flex-col gap-2 text-gray-600 leading-relaxed">{children}</div>
    </section>
  );
}

export default function TermsPage() {
  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-10">
      <div>
        <h1 className="text-3xl font-black text-gray-900">Terms of Service</h1>
        <p className="text-gray-500 mt-2">Last updated: June 2026</p>
      </div>

      <Section title="Acceptance">
        <p>By using c0upons.com you agree to these terms. If you do not agree, do not use the site.</p>
      </Section>

      <Section title="Service description">
        <p>c0upons.com is a free, community-driven directory of coupon codes and deals. We do not guarantee the accuracy, validity, or availability of any coupon. Codes are submitted by community members and may be expired or incorrect.</p>
      </Section>

      <Section title="Acceptable use">
        <p>You may use c0upons.com to browse, search, copy, and submit coupon codes for personal use. You must not:</p>
        <ul className="list-disc list-inside flex flex-col gap-1">
          <li>Submit false, misleading, or spam coupon data</li>
          <li>Attempt to manipulate voting through bots or multiple accounts</li>
          <li>Scrape the site at a rate that degrades service for others</li>
          <li>Use the service for any unlawful purpose</li>
        </ul>
      </Section>

      <Section title="Community submissions">
        <p>By submitting a coupon, you grant Profullstack, Inc. a perpetual, royalty-free licence to display and distribute the submitted data on c0upons.com and via the API. You represent that you have the right to submit the data and that it does not infringe any third-party rights.</p>
        <p>We reserve the right to remove any submission that violates these terms or that we determine, in our sole discretion, is inappropriate.</p>
      </Section>

      <Section title="Disclaimer of warranties">
        <p>The service is provided "as is" without warranties of any kind, express or implied. We do not warrant that coupons are valid, that the service will be uninterrupted, or that errors will be corrected.</p>
      </Section>

      <Section title="Limitation of liability">
        <p>To the fullest extent permitted by law, Profullstack, Inc. shall not be liable for any indirect, incidental, special, or consequential damages arising from your use of c0upons.com.</p>
      </Section>

      <Section title="Changes">
        <p>We may update these terms at any time. Continued use of the service after changes constitutes acceptance of the revised terms.</p>
      </Section>

      <Section title="Contact">
        <p>Profullstack, Inc. · <a href="mailto:anthony@profullstack.com" className="text-orange-500 hover:underline">anthony@profullstack.com</a></p>
      </Section>
    </div>
  );
}
