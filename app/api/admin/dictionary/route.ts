import { NextResponse } from 'next/server';
import { getAdminClient, requireAdmin } from '@/lib/server/admin/access';

const MAX_TERM_LENGTH = 300;

export async function GET(request: Request) {
  if (!requireAdmin(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const client = getAdminClient();
  if (!client) return NextResponse.json({ error: 'server_not_configured' }, { status: 503 });
  const { data, error } = await client.from('common_dictionary')
    .select('id,english_term,korean_translation')
    .order('english_term', { ascending: true });
  if (error) return NextResponse.json({ error: 'dictionary_read_failed' }, { status: 503 });
  return NextResponse.json({ items: data ?? [] });
}

export async function POST(request: Request) {
  if (!requireAdmin(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const client = getAdminClient();
  if (!client) return NextResponse.json({ error: 'server_not_configured' }, { status: 503 });
  try {
    const body = await request.json() as { englishTerm?: unknown; koreanTranslation?: unknown };
    const englishTerm = typeof body.englishTerm === 'string' ? body.englishTerm.trim().toLowerCase() : '';
    const koreanTranslation = typeof body.koreanTranslation === 'string' ? body.koreanTranslation.trim() : '';
    if (!englishTerm || !koreanTranslation || englishTerm.length > MAX_TERM_LENGTH || koreanTranslation.length > MAX_TERM_LENGTH) {
      return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
    }
    const { data, error } = await client.from('common_dictionary')
      .insert({ english_term: englishTerm, korean_translation: koreanTranslation })
      .select('id,english_term,korean_translation')
      .single();
    if (error) return NextResponse.json({ error: 'dictionary_create_failed' }, { status: 409 });
    return NextResponse.json({ item: data }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }
}
