export interface Category {
  id: number;
  name: string;
  slug: string;
}

export interface Store {
  id: number;
  name: string;
  slug: string;
  logo_url: string | null;
  website: string | null;
  category_id: number | null;
  created_at: string;
}

export type DiscountType = 'percent' | 'fixed';

export interface Coupon {
  id: number;
  store_id: number;
  code: string | null;
  title: string;
  description: string | null;
  discount: string | null;
  discount_type: DiscountType | null;
  discount_value: number | null;
  expiry_date: string | null;
  verified: number;
  votes: number;
  url: string | null;
  image_url: string | null;
  created_at: string;
  store_name?: string;
  store_slug?: string;
  store_logo?: string | null;
}
