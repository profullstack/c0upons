export const dynamic = 'force-dynamic';

import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { getDb } from '@/lib/db';

export const metadata: Metadata = {
  title: 'Blog',
  description: 'Tips, deal roundups, and savings guides from the c0upons community.',
  alternates: { canonical: 'https://c0upons.com/blog' },
};

interface Post {
  id: number;
  slug: string;
  title: string;
  excerpt: string | null;
  cover_image: string | null;
  thumbnail_image: string | null;
  author: string | null;
  published_at: string;
}

async function getPosts(): Promise<Post[]> {
  try {
    const db = getDb();
    return await db.sql`
      SELECT id, slug, title, excerpt, cover_image, thumbnail_image, author, published_at
      FROM blog_posts
      WHERE status = 'published'
      ORDER BY published_at DESC
    `;
  } catch (error) {
    console.error('[blog] failed to load posts', error);
    return [];
  }
}

export default async function BlogPage() {
  const posts = await getPosts();

  return (
    <div className="max-w-4xl mx-auto flex flex-col gap-10">
      <div>
        <h1 className="text-3xl font-black text-gray-900">Blog</h1>
        <p className="text-gray-500 mt-2">Deal tips, savings guides, and community updates.</p>
      </div>

      {posts.length === 0 ? (
        <p className="text-gray-400">No posts yet — check back soon.</p>
      ) : (
        <div className="grid sm:grid-cols-2 gap-6">
          {posts.map((post) => (
            <Link key={post.id} href={`/blog/${post.slug}`} className="group">
              <article className="h-full border border-gray-200 rounded-xl overflow-hidden hover:border-orange-300 hover:shadow-lg hover:shadow-orange-50 transition-all">
                {(post.thumbnail_image || post.cover_image) && (
                  <div className="relative h-48 bg-gray-100">
                    <Image
                      src={post.thumbnail_image || post.cover_image!}
                      alt={post.title}
                      fill
                      className="object-cover"
                    />
                  </div>
                )}
                <div className="p-5 flex flex-col gap-2">
                  <h2 className="font-bold text-gray-900 group-hover:text-orange-500 transition-colors leading-snug">
                    {post.title}
                  </h2>
                  {post.excerpt && (
                    <p className="text-sm text-gray-500 line-clamp-2">{post.excerpt}</p>
                  )}
                  <div className="flex items-center gap-2 mt-auto pt-2 text-xs text-gray-400">
                    {post.author && <span>{post.author}</span>}
                    {post.author && <span>·</span>}
                    <time dateTime={post.published_at}>
                      {new Date(post.published_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                    </time>
                  </div>
                </div>
              </article>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
