import { NextResponse } from 'next/server';
import { getAdminClient, requireAdmin } from '@/lib/server/admin/access';

export async function GET(request: Request) {
  if (!requireAdmin(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const client = getAdminClient();
  if (!client) return NextResponse.json({ error: 'server_not_configured' }, { status: 503 });
  const { data, error } = await client.from('games').select('id,title_en,title_ko').order('title_en', { ascending: true });
  if (error) return NextResponse.json({ error: 'games_read_failed' }, { status: 503 });
  return NextResponse.json({ games: data ?? [] });
}
