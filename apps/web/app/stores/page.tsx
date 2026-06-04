export const dynamic = 'force-dynamic';

import StoreCard from '@/components/StoreCard';
import { getDb } from '@/lib/db';
import { Store } from '@/lib/types';

interface StoreWithCount extends Store {
  coupon_count: number;
}

async function getStores(): Promise<StoreWithCount[]> {
  try {
    const db = getDb();
    return await db.sql`
      SELECT s.*, COUNT(c.id) AS coupon_count
      FROM stores s
      LEFT JOIN coupons c ON c.store_id = s.id
      GROUP BY s.id
      ORDER BY s.name ASC
    `;
  } catch {
    return [];
  }
}

export default async function StoresPage() {
  const stores = await getStores();

  const grouped = stores.reduce<Record<string, StoreWithCount[]>>((acc, store) => {
    const letter = store.name[0].toUpperCase();
    if (!acc[letter]) acc[letter] = [];
    acc[letter].push(store);
    return acc;
  }, {});

  const letters = Object.keys(grouped).sort();

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h1 className="text-3xl font-black text-gray-900">All Stores</h1>
        <p className="text-gray-500 mt-1">{stores.length} stores with active coupons</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {letters.map((l) => (
          <a
            key={l}
            href={`#letter-${l}`}
            className="w-8 h-8 flex items-center justify-center bg-white border border-gray-200 rounded font-semibold text-sm hover:bg-orange-500 hover:text-white hover:border-orange-500 transition-colors"
          >
            {l}
          </a>
        ))}
      </div>

      {letters.map((letter) => (
        <section key={letter} id={`letter-${letter}`}>
          <h2 className="text-lg font-bold text-gray-700 mb-3 border-b pb-1">{letter}</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {grouped[letter].map((s) => (
              <StoreCard key={s.id} store={s} />
            ))}
          </div>
        </section>
      ))}

      {stores.length === 0 && (
        <p className="text-gray-400">No stores yet.</p>
      )}
    </div>
  );
}
