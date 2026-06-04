import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Script from "next/script";

const geist = Geist({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "c0upons — Community Coupon Codes",
  description: "Find and share the best coupon codes and deals, updated daily by the community.",
  keywords: ["coupons", "promo codes", "deals", "discounts", "savings"],
  openGraph: {
    title: "c0upons — Community Coupon Codes",
    description: "Find and share the best coupon codes and deals.",
    url: "https://c0upons.com",
    siteName: "c0upons",
    type: "website",
  },
  metadataBase: new URL("https://c0upons.com"),
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geist.className} bg-white text-slate-900 antialiased overflow-x-hidden`}>
        <Header />
        <main className="max-w-7xl mx-auto px-4 py-10">{children}</main>
        <Footer />
              <Script data-site="e615d01b-b475-4df6-8d72-c6f60acfcf04" src="https://crawlproof.com/stats.js" strategy="afterInteractive" />
      </body>
    </html>
  );
}
