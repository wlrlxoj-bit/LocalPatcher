import 'server-only';

import { createClient } from '@supabase/supabase-js';
import { requireTranslationAdmin } from '@/lib/server/translation/admin-auth';

/** 관리자 API에서만 서비스 역할 DB 클라이언트를 만들고 클라이언트 번들 유입을 막습니다. */
export function requireAdmin(request: Request) {
  return requireTranslationAdmin(request);
}

/** 브라우저 공개 키가 아닌 서버 전용 서비스 역할 키로 관리자 CRUD를 수행합니다. */
export function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
