import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import type { DiscountType } from '@/lib/types';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limit = parseInt(searchParams.get('limit') ?? '20');
  const offset = parseInt(searchParams.get('offset') ?? '0');

  try {
    const db = getDb();
    const coupons = await db.sql`
      SELECT c.*, s.name AS store_name, s.slug AS store_slug, s.logo_url AS store_logo
      FROM coupons c
      JOIN stores s ON s.id = c.store_id
      ORDER BY c.votes DESC, c.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
    return NextResponse.json(coupons);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Failed to fetch coupons' }, { status: 500 });
  }
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/** Human-readable badge text from structured discount fields. */
function formatDiscount(type: DiscountType | null, value: number | null): string | null {
  if (value == null || Number.isNaN(value)) return null;
  if (type === 'percent') return `${value}%`;
  if (type === 'fixed') return `$${value} off`;
  return null;
}

/**
 * Resolve a store by website domain (preferred) or name, creating it if needed.
 * Returns the store id.
 */
async function resolveStoreId(
  db: ReturnType<typeof getDb>,
  opts: { name: string | null; website: string | null; logoCandidate: string | null }
): Promise<number> {
  const name = opts.name?.trim() || null;

  // Derive a stable slug: prefer the website host, fall back to the name.
  let slugBase = name;
  let website = opts.website?.trim() || null;
  if (website) {
    try {
      const host = new URL(website).hostname.replace(/^www\./, '');
      slugBase = slugBase ?? host.split('.')[0];
      website = `${new URL(website).protocol}//${new URL(website).hostname}`;
    } catch {
      /* keep website as-is */
    }
  }
  if (!slugBase) slugBase = 'unknown-store';
  const slug = slugify(slugBase) || 'unknown-store';

  const existing = await db.sql`SELECT id FROM stores WHERE slug = ${slug} LIMIT 1`;
  if (existing.length > 0) return existing[0].id;

  await db.sql`
    INSERT INTO stores (name, slug, website)
    VALUES (${name ?? slugBase}, ${slug}, ${website})
  `;
  const created = await db.sql`SELECT id FROM stores WHERE slug = ${slug} LIMIT 1`;
  return created[0].id;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      url,
      code,
      discount_type,
      discount_value,
      expiry_date,
      // AI-scraped listing metadata
      title,
      description,
      store_name,
      store_website,
      image_url,
    } = body;

    if (!url) {
      return NextResponse.json({ error: 'url is required' }, { status: 400 });
    }
    if (!title) {
      return NextResponse.json(
        { error: 'title is required (scrape the URL first)' },
        { status: 400 }
      );
    }

    const type: DiscountType | null =
      discount_type === 'percent' || discount_type === 'fixed' ? discount_type : null;
    const value =
      discount_value === '' || discount_value == null ? null : Number(discount_value);
    const discount = formatDiscount(type, value);

    const db = getDb();
    const storeId = await resolveStoreId(db, {
      name: store_name ?? null,
      website: store_website ?? null,
      logoCandidate: image_url ?? null,
    });

    await db.sql`
      INSERT INTO coupons (
        store_id, code, title, description, discount, discount_type, discount_value,
        expiry_date, url, image_url
      )
      VALUES (
        ${storeId}, ${code?.trim() || null}, ${title}, ${description ?? null}, ${discount},
        ${type}, ${value}, ${expiry_date || null}, ${url}, ${image_url ?? null}
      )
    `;
    return NextResponse.json({ success: true }, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Failed to create coupon' }, { status: 500 });
  }
}
