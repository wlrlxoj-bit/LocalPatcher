import { NextRequest, NextResponse } from 'next/server';
import { getMappingsForTrainer, mockTrainers } from '@/lib/supabase';

const PUBLIC_CACHE_HEADERS = {
  'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
};
const NO_STORE_HEADERS = {
  'Cache-Control': 'private, no-store',
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ trainer_id: string }> }
) {
  try {
    const { trainer_id } = await params;
    const trainerIdNum = Number(trainer_id);

    // Parse lang query param (defaults to 'ko')
    const { searchParams } = new URL(request.url);
    const lang = searchParams.get('lang') || 'ko';

    if (isNaN(trainerIdNum)) {
      return NextResponse.json(
        { error: 'Invalid trainer ID' },
        { status: 400, headers: NO_STORE_HEADERS },
      );
    }

    // 1. Fetch translation mappings
    const mappings = await getMappingsForTrainer(trainerIdNum, lang);

    // 2. Fetch trainer details to return size and hash metadata
    const trainer = mockTrainers.find(t => t.id === trainerIdNum); // Real app would query Supabase

    return NextResponse.json(
      {
        trainer_id: trainerIdNum,
        language_code: lang,
        original_file_size: trainer?.original_file_size || 0,
        original_file_hash: trainer?.original_file_hash || '',
        mappings: mappings.map(m => ({
          offset_dec: m.offset_dec,
          text: m.translated_text,
          encoding: m.encoding,
          max_len: m.max_char_len,
        })),
      },
      { status: 200, headers: PUBLIC_CACHE_HEADERS },
    );
  } catch (err: any) {
    console.error('API Error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}
