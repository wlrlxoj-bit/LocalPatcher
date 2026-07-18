import 'server-only';
import { ADMIN_SESSION_COOKIE, isValidAdminSession } from '@/lib/admin-session';

export function requireTranslationAdmin(request: Request) {
  const cookie = request.headers.get('cookie') || '';
  const token = cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${ADMIN_SESSION_COOKIE}=`))?.slice(ADMIN_SESSION_COOKIE.length + 1);
  return isValidAdminSession(token);
}
