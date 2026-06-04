import type { NextConfig } from 'next';

// @serwist/next uses a webpack plugin that is incompatible with Turbopack
// (Next.js 16 default). Disabled until Turbopack support lands in serwist.
// Track: https://github.com/serwist/serwist/issues/54
const withSerwist = (cfg: NextConfig) => cfg;

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  turbopack: {},
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
    ],
  },
  headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default withSerwist(nextConfig);
