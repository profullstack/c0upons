import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Script from "next/script";

const geist = Geist({ subsets: ["latin"] });

const BASE = "https://c0upons.com";

export const metadata: Metadata = {
  metadataBase: new URL(BASE),
  title: {
    default: "c0upons — Community Coupon Codes",
    template: "%s — c0upons",
  },
  description: "Find and share the best coupon codes and deals, updated daily by the community. Browse coupons for hundreds of stores.",
  keywords: ["coupons", "promo codes", "deals", "discounts", "savings", "coupon codes"],
  authors: [{ name: "c0upons", url: BASE }],
  alternates: { canonical: BASE },
  openGraph: {
    title: "c0upons — Community Coupon Codes",
    description: "Find and share the best coupon codes and deals, updated daily by the community.",
    url: BASE,
    siteName: "c0upons",
    type: "website",
    locale: "en_US",
    images: [{ url: `${BASE}/opengraph-image`, width: 1200, height: 630, alt: "c0upons — Community Coupon Codes" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "c0upons — Community Coupon Codes",
    description: "Find and share the best coupon codes and deals, updated daily by the community.",
    images: [`${BASE}/opengraph-image`],
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
  robots: { index: true, follow: true },
};

const orgSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "c0upons",
  url: BASE,
  logo: `${BASE}/logo.svg`,
  description: "Community-powered coupon codes and deals. Find and share the best coupons for your favourite stores.",
  sameAs: ["https://github.com/profullstack/c0upons"],
};

const siteSchema = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: "c0upons",
  url: BASE,
  potentialAction: {
    "@type": "SearchAction",
    target: { "@type": "EntryPoint", urlTemplate: `${BASE}/search?q={search_term_string}` },
    "query-input": "required name=search_term_string",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="alternate" type="application/rss+xml" title="c0upons Blog" href="https://c0upons.com/blog/rss.xml" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify([orgSchema, siteSchema]) }}
        />
      </head>
      <body className={`${geist.className} bg-white text-gray-900 antialiased overflow-x-hidden`}>
        <Header />
        <main className="max-w-7xl mx-auto px-4 py-10">{children}</main>
        <Footer />
        <Script data-site="e615d01b-b475-4df6-8d72-c6f60acfcf04" src="https://crawlproof.com/stats.js" strategy="afterInteractive" />
      <script async src="https://feedback.profullstack.com/embed/profullstack-feedback.js" data-property="c0upons.com"></script></body>
    </html>
  );
}
