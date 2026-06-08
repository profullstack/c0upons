import type { NextConfig } from 'next';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

loadRootEnv();

// @serwist/next uses a webpack plugin that is incompatible with Turbopack
// (Next.js 16 default). Disabled until Turbopack support lands in serwist.
// Track: https://github.com/serwist/serwist/issues/54
const withSerwist = (cfg: NextConfig) => cfg;

const nextConfig: NextConfig = {
  reactStrictMode: true,
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
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://crawlproof.com",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: https:",
              "font-src 'self' data: https:",
              "connect-src 'self' https:",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self' https://coinpayportal.com",
            ].join('; '),
          },
        ],
      },
    ];
  },
};

export default withSerwist(nextConfig);

function loadRootEnv() {
  const envPath = [
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), '../..', '.env'),
  ].find((path) => existsSync(path));
  if (!envPath) return;

  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^(['"])(.*)\1$/, '$2');
    process.env[key] ??= value;
  }
}
