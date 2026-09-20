import { NextResponse } from 'next/server';
import { getAdminClient, requireAdmin } from '@/lib/server/admin/access';

export async function GET(request: Request) {
  if (!requireAdmin(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const gameId = Number(new URL(request.url).searchParams.get('gameId'));
  if (!Number.isSafeInteger(gameId) || gameId <= 0) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  const client = getAdminClient();
  if (!client) return NextResponse.json({ error: 'server_not_configured' }, { status: 503 });
  const { data, error } = await client.from('trainers').select('id,version_str').eq('game_id', gameId).order('version_str', { ascending: false });
  if (error) return NextResponse.json({ error: 'trainers_read_failed' }, { status: 503 });
  return NextResponse.json({ trainers: data ?? [] });
}
