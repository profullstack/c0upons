import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

const SECRET = process.env.CRAWLPROOF_WEBHOOK_SECRET!;

function verify(req: NextRequest): boolean {
  const auth = req.headers.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : auth;
  return token === SECRET;
}

export async function POST(req: NextRequest) {
  if (!verify(req)) {
    console.error('CrawlProof webhook: unauthorized');
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const payload = await req.json();
  const { type, data } = payload;

  console.log('CrawlProof webhook:', type);

  const db = getDb();

  if (type === 'blog.publish' || type === 'blog.update') {
    const { slug, title, excerpt = null, content = '', cover_image = null, author = null, published_at = null } = data;

    if (!slug || !title) {
      return NextResponse.json({ error: 'slug and title are required' }, { status: 400 });
    }

    await db.sql`
      INSERT INTO blog_posts (slug, title, excerpt, content, cover_image, author, published_at, updated_at, status)
      VALUES (
        ${slug}, ${title}, ${excerpt}, ${content}, ${cover_image}, ${author},
        ${published_at ?? new Date().toISOString()},
        ${new Date().toISOString()},
        'published'
      )
      ON CONFLICT(slug) DO UPDATE SET
        title       = excluded.title,
        excerpt     = excluded.excerpt,
        content     = excluded.content,
        cover_image = excluded.cover_image,
        author      = excluded.author,
        updated_at  = excluded.updated_at,
        status      = 'published'
    `;

    return NextResponse.json({ received: true, slug });
  }

  if (type === 'blog.delete') {
    const { slug } = data;
    if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });
    await db.sql`DELETE FROM blog_posts WHERE slug = ${slug}`;
    return NextResponse.json({ received: true, deleted: slug });
  }

  if (type === 'blog.unpublish') {
    const { slug } = data;
    if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 });
    await db.sql`UPDATE blog_posts SET status = 'draft', updated_at = ${new Date().toISOString()} WHERE slug = ${slug}`;
    return NextResponse.json({ received: true, slug });
  }

  return NextResponse.json({ received: true, type });
}
