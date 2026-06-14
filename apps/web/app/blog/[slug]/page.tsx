export const dynamic = 'force-dynamic';

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import sanitizeHtml from 'sanitize-html';
import { getDb } from '@/lib/db';

interface Post {
  id: number;
  slug: string;
  title: string;
  excerpt: string | null;
  content: string;
  cover_image: string | null;
  thumbnail_image: string | null;
  banner_image: string | null;
  author: string | null;
  published_at: string;
  updated_at: string;
}

async function getPost(slug: string): Promise<Post | null> {
  try {
    const db = getDb();
    const rows = await db.sql`
      SELECT * FROM blog_posts
      WHERE slug = ${slug} AND status = 'published'
    `;
    return rows.length ? rows[0] : null;
  } catch (error) {
    console.error('[blog] failed to load post', error);
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) return { title: 'Post not found' };

  return {
    title: post.title,
    description: post.excerpt ?? undefined,
    alternates: { canonical: `https://c0upons.com/blog/${slug}` },
    openGraph: {
      title: post.title,
      description: post.excerpt ?? undefined,
      url: `https://c0upons.com/blog/${slug}`,
      type: 'article',
      publishedTime: post.published_at,
      modifiedTime: post.updated_at,
      images: (post.banner_image || post.cover_image || post.thumbnail_image)
        ? [{ url: post.banner_image || post.cover_image || post.thumbnail_image! }]
        : [],
    },
  };
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getPost(slug);
  if (!post) notFound();

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-8">
      <Link href="/blog" className="text-sm text-orange-500 hover:underline">← All posts</Link>

      <article className="flex flex-col gap-6">
        {(post.banner_image || post.cover_image) && (
          <div className="relative h-64 rounded-2xl overflow-hidden bg-gray-100 sm:h-80">
            <Image src={post.banner_image || post.cover_image!} alt={post.title} fill className="object-cover" priority />
          </div>
        )}

        <header className="flex flex-col gap-4 sm:flex-row">
          {post.thumbnail_image && (
            <div className="relative mt-1 size-20 shrink-0 overflow-hidden rounded-xl bg-gray-100 sm:size-24">
              <Image src={post.thumbnail_image} alt="" fill className="object-cover" />
            </div>
          )}
          <div className="flex min-w-0 flex-col gap-3">
            <h1 className="text-3xl font-black text-gray-900 leading-tight">{post.title}</h1>
            <div className="flex flex-wrap items-center gap-2 text-sm text-gray-400">
              {post.author && <span className="font-medium text-gray-600">{post.author}</span>}
              {post.author && <span>·</span>}
              <time dateTime={post.published_at}>
                {new Date(post.published_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
              </time>
            </div>
          </div>
        </header>

        <div
          className="prose prose-gray max-w-none text-gray-700 leading-relaxed [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-gray-900 [&_h2]:mt-8 [&_h2]:mb-3 [&_h3]:text-base [&_h3]:font-bold [&_h3]:text-gray-800 [&_h3]:mt-6 [&_h3]:mb-2 [&_p]:mb-4 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-4 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-4 [&_li]:mb-1 [&_a]:text-orange-500 [&_a]:underline [&_code]:bg-gray-100 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-sm [&_pre]:bg-gray-900 [&_pre]:text-gray-100 [&_pre]:p-4 [&_pre]:rounded-xl [&_pre]:overflow-x-auto [&_blockquote]:border-l-4 [&_blockquote]:border-orange-300 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-gray-500"
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(post.content, {
            allowedTags: sanitizeHtml.defaults.allowedTags.concat(['img', 'h1', 'h2', 'h3']),
            allowedAttributes: {
              ...sanitizeHtml.defaults.allowedAttributes,
              img: ['src', 'alt', 'width', 'height', 'loading'],
            },
          }) }}
        />
      </article>

      <div className="border-t border-gray-200 pt-8">
        <Link
          href="/submit"
          className="inline-flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-semibold px-5 py-2.5 rounded-xl text-sm transition-colors"
        >
          Found a deal? Submit a coupon →
        </Link>
      </div>
    </div>
  );
}
