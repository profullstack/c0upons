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
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
