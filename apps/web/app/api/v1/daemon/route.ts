import { NextResponse } from 'next/server';
import { getDaemon } from '@/lib/daemon';

export const dynamic = 'force-dynamic';

/** What the scraper daemon is doing: tasks, due work, failures, the last runs. Public, like every fleet daemon's. */
export async function GET() {
  const daemon = getDaemon();
  if (!daemon) return NextResponse.json({ ok: false, running: false }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  return NextResponse.json(await daemon.status(), {
    headers: { 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' },
  });
}
