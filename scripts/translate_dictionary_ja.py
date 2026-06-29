"""
common_dictionary 테이블에서 translated_ja가 비어있는 항목을 
OpenAI gpt-4.1-mini API를 사용해 게임에 어울리는 일어로 번역하여 저장하는 스크립트.
"""
import os
import sys
import json
sys.stdout.reconfigure(encoding='utf-8')

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env.local'), override=True)

from supabase import create_client
from openai import OpenAI

db = create_client(
    os.environ['NEXT_PUBLIC_SUPABASE_URL'],
    os.environ['NEXT_PUBLIC_SUPABASE_ANON_KEY']
)

client = OpenAI(api_key=os.environ['OPENAI_API_KEY'])

def main():
    print("[*] common_dictionary에서 번역할 항목을 가져오는 중...")
    
    # 전체 항목 조회 후 Python에서 필터링 (Supabase 복잡 필터 우회)
    res = db.table('common_dictionary').select('id, english_term, korean_translation, translated_ja').execute()
    
    pending_items = []
    for row in res.data:
        t_ja = row.get('translated_ja')
        if not t_ja or str(t_ja).strip() == '':
            pending_items.append({
                'id': row['id'],
                'english_term': row['english_term'],
                'korean_translation': row['korean_translation']
            })
            
    total_pending = len(pending_items)
    print(f"[+] 번역 대기 중인 항목 수: {total_pending}개")
    
    if total_pending == 0:
        print("[+] 번역할 항목이 없습니다. 완료되었습니다.")
        return

    # 100~150개 단위로 배치 처리
    batch_size = 150
    for i in range(0, total_pending, batch_size):
        batch = pending_items[i:i+batch_size]
        print(f"[*] 배치 처리 중 ({i+1}~{min(i+batch_size, total_pending)} / {total_pending})...")
        
        prompt = (
            "You are a professional game localization expert. Translate the following list of English game trainer cheat terms into natural, gaming-appropriate Japanese. "
            "We provide the English term and its Korean translation for context. "
            "Use standard Japanese gaming conventions (e.g. '無限体力' or '体力無限' for infinite health, '無限弾薬' or '弾薬無限' for infinite ammo, '弾薬減少なし' for ammo won't decrease, 'ゲームスピード設定' for set game speed). "
            "Return the translations in JSON format matching this schema:\n"
            "{\n"
            "  \"translations\": [\n"
            "    {\"id\": <id>, \"translated_ja\": \"<japanese_translation>\"}\n"
            "  ]\n"
            "}\n"
            "Only return the JSON object."
        )
        
        try:
            response = client.chat.completions.create(
                model="gpt-4.1-mini",
                messages=[
                    {"role": "system", "content": prompt},
                    {"role": "user", "content": json.dumps(batch, ensure_ascii=False)}
                ],
                response_format={"type": "json_object"},
                temperature=0.1
            )
            
            result = json.loads(response.choices[0].message.content)
            translations = result.get("translations", [])
            
            # DB 업데이트
            updated_count = 0
            for trans in translations:
                tid = trans.get("id")
                tja = trans.get("translated_ja")
                if tid is not None and tja:
                    db.table('common_dictionary').update({'translated_ja': tja}).eq('id', tid).execute()
                    updated_count += 1
            
            print(f"[+] 배치 업데이트 완료: {updated_count}개 항목 업데이트됨.")
            
        except Exception as e:
            print(f"[-] 배치 처리 중 에러 발생: {e}")
            
    print("[*] 모든 번역 처리가 종료되었습니다.")

if __name__ == "__main__":
    main()
