"""common_dictionary 테이블의 현재 축적 데이터를 조회하는 진단 스크립트"""
import os, sys
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env.local'))

from supabase import create_client
db = create_client(
    os.environ['NEXT_PUBLIC_SUPABASE_URL'],
    os.environ['NEXT_PUBLIC_SUPABASE_ANON_KEY']
)

# 전체 건수 조회
res = db.table('common_dictionary').select('id, english_term, korean_translation').order('id').execute()
rows = res.data

print(f"=== common_dictionary 테이블 전체 현황 ===")
print(f"총 누적 항목 수: {len(rows)}")
print(f"{'ID':>4}  {'English Term':<45} {'Korean Translation'}")
print("-" * 90)
for r in rows:
    print(f"{r['id']:>4}  {r['english_term']:<45} {r['korean_translation']}")
