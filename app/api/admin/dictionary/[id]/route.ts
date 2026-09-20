import { NextResponse } from 'next/server';
import { getAdminClient, requireAdmin } from '@/lib/server/admin/access';

const MAX_TERM_LENGTH = 300;

function dictionaryId(value: string) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!requireAdmin(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const client = getAdminClient();
  const id = dictionaryId((await context.params).id);
  if (!client) return NextResponse.json({ error: 'server_not_configured' }, { status: 503 });
  if (!id) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  try {
    const body = await request.json() as { koreanTranslation?: unknown };
    const koreanTranslation = typeof body.koreanTranslation === 'string' ? body.koreanTranslation.trim() : '';
    if (!koreanTranslation || koreanTranslation.length > MAX_TERM_LENGTH) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
    const { data, error } = await client.from('common_dictionary')
      .update({ korean_translation: koreanTranslation })
      .eq('id', id)
      .select('id,english_term,korean_translation')
      .maybeSingle();
    if (error) return NextResponse.json({ error: 'dictionary_update_failed' }, { status: 503 });
    if (!data) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return NextResponse.json({ item: data });
  } catch {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!requireAdmin(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const client = getAdminClient();
  const id = dictionaryId((await context.params).id);
  if (!client) return NextResponse.json({ error: 'server_not_configured' }, { status: 503 });
  if (!id) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  const { data, error } = await client.from('common_dictionary').delete().eq('id', id).select('id').maybeSingle();
  if (error) return NextResponse.json({ error: 'dictionary_delete_failed' }, { status: 503 });
  if (!data) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  return new NextResponse(null, { status: 204 });
}
