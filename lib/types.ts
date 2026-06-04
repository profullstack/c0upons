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

export interface Coupon {
  id: number;
  store_id: number;
  code: string | null;
  title: string;
  description: string | null;
  discount: string | null;
  expiry_date: string | null;
  verified: number;
  votes: number;
  url: string | null;
  created_at: string;
  store_name?: string;
  store_slug?: string;
  store_logo?: string | null;
}
