import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { loadRootEnv } from '@/lib/root-env';

loadRootEnv();
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

  if (
    type === 'blog.publish' ||
    type === 'blog.update' ||
    type === 'com.crawlproof.post.published.v1' ||
    type === 'com.crawlproof.post.updated.v1'
  ) {
    const post = normalizePost(payload);
    const {
      source_id,
      slug,
      title,
      excerpt,
      content,
      cover_image,
      thumbnail_image,
      banner_image,
      author,
      published_at,
      updated_at,
    } = post;

    if (!slug || !title) {
      return NextResponse.json({ error: 'slug and title are required' }, { status: 400 });
    }

    await db.sql`
      INSERT INTO blog_posts (
        slug, title, excerpt, content, cover_image, thumbnail_image,
        banner_image, author, published_at, updated_at, status, source, source_id
      )
      VALUES (
        ${slug}, ${title}, ${excerpt}, ${content}, ${cover_image},
        ${thumbnail_image}, ${banner_image}, ${author}, ${published_at},
        ${updated_at}, 'published', 'crawlproof', ${source_id}
      )
      ON CONFLICT(slug) DO UPDATE SET
        title           = excluded.title,
        excerpt         = excluded.excerpt,
        content         = excluded.content,
        cover_image     = excluded.cover_image,
        thumbnail_image = excluded.thumbnail_image,
        banner_image    = excluded.banner_image,
        author          = excluded.author,
        published_at    = excluded.published_at,
        updated_at      = excluded.updated_at,
        status          = 'published',
        source          = excluded.source,
        source_id       = excluded.source_id
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

function normalizePost(payload: any) {
  const data = payload?.data ?? {};
  const raw = data?.post ?? data;
  const featured = imageUrl(raw.featured_image);
  const cover = imageUrl(raw.cover_image) ?? imageUrl(raw.image_url) ?? featured;
  const thumbnail = imageUrl(raw.thumbnail_image) ?? imageUrl(raw.thumbnail) ?? cover;
  const banner = imageUrl(raw.banner_image) ?? imageUrl(raw.banner) ?? cover;
  const now = new Date().toISOString();
  return {
    source_id: raw.id ? String(raw.id) : null,
    slug: raw.slug,
    title: raw.title,
    excerpt: raw.excerpt ?? raw.meta_description ?? null,
    content: raw.html ?? raw.content_html ?? raw.content ?? '',
    cover_image: cover,
    thumbnail_image: thumbnail,
    banner_image: banner,
    author: typeof raw.author === 'string' ? raw.author : raw.author?.name ?? null,
    published_at: raw.published_at ?? now,
    updated_at: raw.updated_at ?? now,
  };
}

function imageUrl(value: any): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value.url === 'string') return value.url;
  if (typeof value.src === 'string') return value.src;
  return null;
}
