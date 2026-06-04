import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Script from "next/script";

const geist = Geist({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "c0upons — Community Coupon Codes",
  description: "Find and share the best coupon codes and deals.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geist.className} bg-gray-50 text-gray-900 antialiased overflow-x-hidden`}>
        <Header />
        <main className="max-w-7xl mx-auto px-4 py-8">{children}</main>
        <Footer />
              <Script data-site="e615d01b-b475-4df6-8d72-c6f60acfcf04" src="https://crawlproof.com/stats.js" strategy="afterInteractive" />
      </body>
    </html>
  );
}
