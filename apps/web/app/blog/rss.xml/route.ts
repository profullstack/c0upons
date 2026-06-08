export const dynamic = 'force-dynamic';

import { getDb } from '@/lib/db';

const BASE = 'https://c0upons.com';

export async function GET() {
  let posts: Array<{ slug: string; title: string; excerpt: string | null; published_at: string; author: string | null }> = [];

  try {
    const db = getDb();
    posts = await db.sql`
      SELECT slug, title, excerpt, published_at, author
      FROM blog_posts
      WHERE status = 'published'
      ORDER BY published_at DESC
      LIMIT 50
    `;
  } catch (error) {
    console.error('[blog] failed to load rss posts', error);
  }

  const items = posts.map((p) => `
    <item>
      <title><![CDATA[${p.title}]]></title>
      <link>${BASE}/blog/${p.slug}</link>
      <guid isPermaLink="true">${BASE}/blog/${p.slug}</guid>
      ${p.excerpt ? `<description><![CDATA[${p.excerpt}]]></description>` : ''}
      ${p.author ? `<author>${p.author}</author>` : ''}
      <pubDate>${new Date(p.published_at).toUTCString()}</pubDate>
    </item>`).join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>c0upons Blog</title>
    <link>${BASE}/blog</link>
    <description>Deal tips, savings guides, and community updates from c0upons.</description>
    <language>en-US</language>
    <atom:link href="${BASE}/blog/rss.xml" rel="self" type="application/rss+xml"/>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    ${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
