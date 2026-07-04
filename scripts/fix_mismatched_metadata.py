"""
스팀 검색 시 1편 단어가 2편 검색어와 혼동되어 
후속작(2편)이나 DX 버전으로 오등록된 17개 게임의 메타데이터를
정확한 스팀 AppID 정보를 기반으로 데이터베이스에서 원스톱으로 강제 복원하는 배치 스크립트.
"""
import os
import sys
import requests
sys.stdout.reconfigure(encoding='utf-8')

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env.local'), override=True)

from supabase import create_client

SUPABASE_URL = os.environ.get('NEXT_PUBLIC_SUPABASE_URL')
SUPABASE_KEY = os.environ.get('NEXT_PUBLIC_SUPABASE_ANON_KEY')

db = create_client(SUPABASE_URL, SUPABASE_KEY)

# 1편/오리지널 게임 슬러그와 매칭되는 정확한 Steam AppID 맵
CORRECT_APPIDS = {
    'humankind-trainer': '1124300',                              # Humankind (original)
    'blasphemous-trainer': '774361',                            # Blasphemous 1
    'death-stranding-trainer': '1190460',                       # Death Stranding (original)
    'everspace-trainer': '396750',                              # Everspace 1
    'hades-trainer': '1145360',                                 # Hades 1
    'kingdom-come-deliverance-trainer': '379430',                # Kingdom Come: Deliverance 1
    'remnant-trainer': '617290',                                # Remnant: From the Ashes (1)
    'red-dead-redemption-trainer': '2668510',                   # Red Dead Redemption 1
    'sniper-ghost-warrior-contracts-trainer': '973580',          # Sniper Ghost Warrior Contracts 1
    'the-outer-worlds-trainer': '570300',                        # The Outer Worlds (1)
    'ghostrunner-trainer': '1139900',                           # Ghostrunner 1
    'demon-slayer-kimetsu-no-yaiba-the-hinokami-chronicles-trainer': '1490890', # Demon Slayer 1
    'atelier-ryza-ever-darkness-the-secret-hideout-trainer': '1121560', # Atelier Ryza 1 (original)
    'atelier-ryza-2-lost-legends-the-secret-fairy-trainer': '1257290',  # Atelier Ryza 2 (original)
    'atelier-ryza-3-alchemist-of-the-end-the-secret-key-trainer': '1997720', # Atelier Ryza 3 (original)
    'subnautica-trainer': '264710',                             # Subnautica 1
    'frostpunk-trainer': '323190'                               # Frostpunk 1
}

def fetch_correct_meta(appid: str, fallback_title: str):
    """Query Steam Store API to fetch precise title and cover art."""
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
    meta = {
        'title_ko': fallback_title,
        'title_en': fallback_title,
        'cover_url': f"https://cdn.cloudflare.steamstatic.com/steam/apps/{appid}/header.jpg"
    }
    try:
        # 1. Fetch Korean details
        url_ko = f"https://store.steampowered.com/api/appdetails?appids={appid}&l=korean"
        res_ko = requests.get(url_ko, headers=headers, timeout=5)
        if res_ko.status_code == 200:
            data = res_ko.json()
            if data.get(appid, {}).get("success"):
                meta['title_ko'] = data[appid]["data"]["name"].replace("®", "").replace("™", "").strip()

        # 2. Fetch English details
        url_en = f"https://store.steampowered.com/api/appdetails?appids={appid}&l=english"
        res_en = requests.get(url_en, headers=headers, timeout=5)
        if res_en.status_code == 200:
            data = res_en.json()
            if data.get(appid, {}).get("success"):
                meta['title_en'] = data[appid]["data"]["name"].replace("®", "").replace("™", "").strip()
                
    except Exception as e:
        print(f"  [-] Steam API Query failed for AppID {appid}: {e}")
        
    return meta

def main():
    print("[*] 메타데이터 매칭 오류 복구 스크립트 시작...")
    
    # 17개 타겟 게임들의 현재 정보를 DB에서 조회
    slugs = list(CORRECT_APPIDS.keys())
    res = db.table('games').select('id, title_en, slug').in_('slug', slugs).execute()
    
    if not res.data:
        print("[-] 복구할 대상 게임이 데이터베이스에 없습니다.")
        return
        
    print(f"[+] 조회 완료: {len(res.data)}개의 게임이 복구 대상입니다.")
    
    success_count = 0
    for g in res.data:
        game_id = g['id']
        title_en = g['title_en']
        slug = g['slug']
        appid = CORRECT_APPIDS[slug]
        
        print(f"\n[*] 복구 진행 중: {title_en} (Slug: {slug}) ➡️ Steam AppID {appid}")
        
        # 스팀 API 조회
        meta = fetch_correct_meta(appid, title_en)
        
        # DB 업데이트
        try:
            update_res = db.table('games').update({
                'title_ko': meta['title_ko'],
                'title_en': meta['title_en'],
                'cover_image_url': meta['cover_url']
            }).eq('id', game_id).execute()
            
            if update_res.data:
                print(f"  [+] 복구 성공: 한글명: '{meta['title_ko']}' | 영문명: '{meta['title_en']}'")
                print(f"  [+] 커버 이미지: {meta['cover_url']}")
                success_count += 1
            else:
                print("  [-] DB 업데이트 결과 데이터가 비어 있습니다.")
        except Exception as e:
            print(f"  [-] DB 업데이트 중 예외 발생: {e}")
            
    print(f"\n[+] 메타데이터 일괄 복원 완료! 총 {success_count}개 게임 정보가 정상 교정되었습니다.")

if __name__ == "__main__":
    main()
