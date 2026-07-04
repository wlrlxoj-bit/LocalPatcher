# -*- coding: utf-8 -*-
"""
DB 내 커버 이미지가 누락(default_cover)되거나 제목에 숫자가 장납된 게임들을
전수 검출하여, 스팀 Store API 기반으로 정확한 메타데이터를 일괄 복원하는 스크립트.
"""
import os
import sys
import re
import time
import requests
sys.stdout.reconfigure(encoding='utf-8')

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env.local'), override=True)

from supabase import create_client

db = create_client(
    os.environ['NEXT_PUBLIC_SUPABASE_URL'],
    os.environ['NEXT_PUBLIC_SUPABASE_ANON_KEY']
)

def fetch_steam_meta(game_title_clean):
    """Steam Store Search API를 통해 정확한 AppID, 한글명, 커버아트를 조회한다."""
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
    try:
        search_url = f"https://store.steampowered.com/api/storesearch/?term={requests.utils.quote(game_title_clean)}&l=english&cc=US"
        res = requests.get(search_url, headers=headers, timeout=5)
        if res.status_code == 200:
            items = res.json().get("items", [])
            if items:
                appid = str(items[0]["id"])
                d_res = requests.get(f"https://store.steampowered.com/api/appdetails?appids={appid}&l=korean", headers=headers, timeout=5)
                title_ko = game_title_clean
                if d_res.status_code == 200:
                    d_data = d_res.json()
                    if d_data.get(appid, {}).get("success"):
                        title_ko = d_data[appid]["data"]["name"].replace("®", "").replace("™", "").strip()
                cover_url = f"https://cdn.cloudflare.steamstatic.com/steam/apps/{appid}/header.jpg"
                return {'appid': appid, 'title_ko': title_ko, 'cover_url': cover_url}
    except Exception as e:
        print(f"  [-] Steam 검색 실패: {e}")
    return None

def clean_title(title_en):
    """제목에서 FLiNG 크롤러 장납 숫자, 's' 오타 등을 정리한다."""
    cleaned = re.sub(r'\s+\d{6,}$', '', title_en).strip()
    if cleaned.endswith('ys') and not cleaned.endswith('ays') and not cleaned.endswith('eys') and not cleaned.endswith('oys') and not cleaned.endswith('uys'):
        cleaned = cleaned[:-1]
    return cleaned

def main():
    print("[*] 커버 이미지 누락 및 제목 오류 게임 전수 조사 시작...")
    res = db.table('games').select('id, title_en, title_ko, slug, cover_image_url').execute()
    all_games = res.data
    
    problematic = []
    for g in all_games:
        cover = g.get('cover_image_url', '')
        title = g.get('title_en', '')
        has_bad_cover = 'default_cover' in cover or not cover or 'flingtrainer.com' in cover
        has_trailing_numbers = bool(re.search(r'\s+\d{6,}$', title))
        has_typo_s = title.endswith('ys') and not title.endswith('ays') and not title.endswith('eys') and not title.endswith('oys') and not title.endswith('uys')
        
        if has_bad_cover or has_trailing_numbers or has_typo_s:
            problematic.append(g)
    
    print(f"[+] 문제 감지된 게임 수: {len(problematic)}개\n")
    
    if not problematic:
        print("[+] 모든 게임의 메타데이터가 정상입니다!")
        return
    
    fixed_count = 0
    for idx, g in enumerate(problematic):
        game_id = g['id']
        original_title = g['title_en']
        cleaned = clean_title(original_title)
        
        print(f"[{idx+1}/{len(problematic)}] ID: {game_id} | 원본: '{original_title}' -> 정리: '{cleaned}'")
        
        meta = fetch_steam_meta(cleaned)
        if not meta:
            print(f"  [-] Steam에서 '{cleaned}'를 찾지 못했습니다. 스킵.")
            continue
        
        try:
            update_data = {
                'title_en': cleaned,
                'title_ko': meta['title_ko'],
                'cover_image_url': meta['cover_url']
            }
            up_res = db.table('games').update(update_data).eq('id', game_id).execute()
            if up_res.data:
                print(f"  [+] 복원: 한글명='{meta['title_ko']}' | 커버={meta['cover_url']}")
                fixed_count += 1
            else:
                print("  [-] DB 업데이트 실패")
        except Exception as e:
            print(f"  [-] 업데이트 예외: {e}")
        
        time.sleep(0.3)
    
    print(f"\n[+] 일괄 복원 완료! 총 {fixed_count}개 게임이 교정되었습니다.")

if __name__ == "__main__":
    main()
