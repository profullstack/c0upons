import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'Privacy policy for c0upons.com — what data we collect and how we use it.',
  alternates: { canonical: 'https://c0upons.com/privacy' },
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-bold text-gray-900 border-b border-gray-200 pb-2">{title}</h2>
      <div className="flex flex-col gap-2 text-gray-600 leading-relaxed">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-10">
      <div>
        <h1 className="text-3xl font-black text-gray-900">Privacy Policy</h1>
        <p className="text-gray-500 mt-2">Last updated: June 2026</p>
      </div>

      <Section title="Overview">
        <p>
          c0upons.com is operated by Profullstack, Inc. This policy explains what personal data we
          collect, how we use it, and your rights. We keep it short because we collect very little.
        </p>
      </Section>

      <Section title="Data we collect">
        <p><strong>Submitted coupons:</strong> When you submit a coupon, we store the coupon data you provide (store, code, title, description, discount, expiry date, URL). No account or email is required.</p>
        <p><strong>Authentication (optional):</strong> If you connect via CoinPay to vote on coupons, we receive and store your CoinPay DID (decentralised identifier) as a pseudonymous identifier. We do not receive your name, email, or payment information.</p>
        <p><strong>Server logs:</strong> Our hosting provider (Railway) may log standard server access data (IP address, user agent, request path, timestamps) for operational and security purposes. We do not retain these logs beyond Railway's standard retention period.</p>
        <p><strong>Analytics:</strong> We use CrawlProof for privacy-friendly site analytics. No cookies are set; no personal data is shared with third parties for advertising.</p>
      </Section>

      <Section title="How we use data">
        <p>We use submitted coupon data solely to display coupons on the site. We use CoinPay DIDs solely to associate votes with an account so each user can vote once per coupon. We do not sell, rent, or share personal data with third parties for marketing.</p>
      </Section>

      <Section title="Cookies">
        <p>We set session cookies for CoinPay authentication (HttpOnly, Secure, SameSite=Lax). These are strictly necessary for the voting feature and expire after 30 days or on logout. No advertising or tracking cookies are used.</p>
      </Section>

      <Section title="Data retention">
        <p>Coupon submissions are retained indefinitely as public community data. CoinPay DIDs are retained while your vote history exists. You may request deletion of your vote history and associated DID by emailing us.</p>
      </Section>

      <Section title="Your rights">
        <p>Under GDPR (EU/UK) and CCPA (California), you may have rights to access, correct, or delete personal data we hold about you. To exercise any right, email <a href="mailto:anthony@profullstack.com" className="text-orange-500 hover:underline">anthony@profullstack.com</a>.</p>
      </Section>

      <Section title="Third-party services">
        <ul className="list-disc list-inside flex flex-col gap-1">
          <li><strong>Railway</strong> — cloud hosting (<a href="https://railway.com/legal/privacy" target="_blank" rel="noopener noreferrer" className="text-orange-500 hover:underline">privacy policy</a>)</li>
          <li><strong>SQLite Cloud</strong> — database provider</li>
          <li><strong>CoinPay</strong> — optional OAuth authentication for voting</li>
          <li><strong>CrawlProof</strong> — privacy-friendly analytics</li>
        </ul>
      </Section>

      <Section title="Contact">
        <p>Profullstack, Inc. · <a href="mailto:anthony@profullstack.com" className="text-orange-500 hover:underline">anthony@profullstack.com</a></p>
      </Section>
    </div>
  );
}
