import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { isValidAdminSession, ADMIN_SESSION_COOKIE } from '@/lib/admin-session';

export async function POST(req: Request) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(ADMIN_SESSION_COOKIE)?.value;
    
    if (!isValidAdminSession(token)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 사이트 전체 캐시 초기화
    revalidatePath('/', 'layout');
    
    return NextResponse.json({ success: true, message: 'All Next.js caches purged successfully.' });
  } catch (error: unknown) {
    console.error('[CACHE_PURGE_FAILED]', { category: error instanceof Error ? 'exception' : 'non_error' });
    return NextResponse.json({ error: 'cache_purge_failed' }, { status: 500 });
  }
}
