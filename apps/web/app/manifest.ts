import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'c0upons',
    short_name: 'c0upons',
    description: 'Community coupon codes and deals',
    start_url: '/',
    display: 'standalone',
    background_color: '#f9fafb',
    theme_color: '#f97316',
    // Generated with cli-tools `favicon` from public/favicon.svg. The maskable
    // pair is a separate full-bleed artwork with the mark inside the centre 80%,
    // so an Android circle mask never clips it.
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
