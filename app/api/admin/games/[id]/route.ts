import { NextResponse } from 'next/server';
import { getAdminClient, requireAdmin } from '@/lib/server/admin/access';

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!requireAdmin(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const client = getAdminClient();
  const id = Number((await context.params).id);
  if (!client) return NextResponse.json({ error: 'server_not_configured' }, { status: 503 });
  if (!Number.isSafeInteger(id) || id <= 0) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  try {
    const body = await request.json() as { isPopular?: unknown; popularityIndex?: unknown };
    const popularityIndex = body.popularityIndex;
    if (typeof body.isPopular !== 'boolean' || typeof popularityIndex !== 'number' || !Number.isSafeInteger(popularityIndex) || popularityIndex < 0 || popularityIndex > 1_000_000) {
      return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
    }
    const { data, error } = await client.from('games')
      .update({ is_popular: body.isPopular, popularity_index: popularityIndex })
      .eq('id', id)
      .select('id,title_en,title_ko,slug,is_popular,popularity_index')
      .maybeSingle();
    if (error) return NextResponse.json({ error: 'games_update_failed' }, { status: 503 });
    if (!data) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return NextResponse.json({ game: data });
  } catch {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }
}
