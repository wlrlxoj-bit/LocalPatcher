"""
데이터베이스 내 트레이너가 누락된 28개 미지원 게임을 추적하여,
FLiNG 공식 사이트로부터 원본 파일을 자동으로 내려받아 분석하고
한글(ko) 및 일본어(ja) 번역 매핑 데이터베이스를 완전 자동 복구하는 스크립트.
"""
import os
import sys
import hashlib
import requests
import zipfile
import io
import re
import subprocess
from bs4 import BeautifulSoup
sys.stdout.reconfigure(encoding='utf-8')

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env.local'), override=True)

# Add scripts directory to sys.path to allow importing scraper
sys.path.append(os.path.dirname(__file__))

from supabase import create_client
# Import helper parsing and translation functions from scraper
from scraper import parse_pe_binary, scan_cheat_string_offset, process_translation_block, process_translation_block_ja, db_dictionary_ko, db_dictionary_ja

SUPABASE_URL = os.environ.get('NEXT_PUBLIC_SUPABASE_URL')
SUPABASE_KEY = os.environ.get('NEXT_PUBLIC_SUPABASE_ANON_KEY')

db = create_client(SUPABASE_URL, SUPABASE_KEY)

def load_dictionaries():
    """Load dynamic translations from database into memory."""
    try:
        res = db.table('common_dictionary').select('english_term, korean_translation, translated_ja').execute()
        if res.data:
            for row in res.data:
                eng = row['english_term'].lower().strip()
                if row.get('korean_translation'):
                    db_dictionary_ko[eng] = row['korean_translation']
                if row.get('translated_ja'):
                    db_dictionary_ja[eng] = row['translated_ja']
            print(f"[+] Loaded {len(db_dictionary_ko)} KO and {len(db_dictionary_ja)} JA translations from database.")
    except Exception as e:
        print(f"[-] Failed to load dictionaries: {e}")

def main():
    load_dictionaries()
    
    print("[*] 데이터베이스 조회 중: 트레이너 바이너리가 비어 있는 게임 색출...")
    
    # 조인 쿼리로 트레이너가 비어 있는 게임 필터링
    res = db.table('games').select('id, title_en, slug, fling_url, trainers(id)').execute()
    games_data = res.data
    
    missing_games = []
    for g in games_data:
        trainers = g.get('trainers', [])
        if not trainers:
            missing_games.append(g)
            
    total_missing = len(missing_games)
    print(f"[+] 총 {total_missing}개의 미지원 게임이 발견되었습니다.\n")
    
    if total_missing == 0:
        print("[+] 누락된 게임이 없습니다. 작업을 종료합니다.")
        return

    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
    
    for idx, g in enumerate(missing_games):
        game_id = g['id']
        title = g['title_en']
        fling_url = g['fling_url']
        slug = g['slug']
        
        print(f"\n==================================================")
        print(f"[{idx+1}/{total_missing}] 게임 처리 중: {title} (ID: {game_id})")
        print(f"  - URL: {fling_url}")
        
        if not fling_url:
            print("  [-] 경고: FLiNG 공식 주소가 비어 있습니다. 건너뜁니다.")
            continue
            
        try:
            # 1. 게임 공식 트레이너 페이지 파싱
            response = requests.get(fling_url, headers=headers, timeout=10)
            if response.status_code != 200:
                print(f"  [-] 페이지 로드 실패 (HTTP {response.status_code})")
                continue
                
            soup = BeautifulSoup(response.text, 'html.parser')
            download_anchors = soup.select('a[href*="/downloads/"]')
            if not download_anchors:
                print("  [-] 페이지에 다운로드 링크가 존재하지 않습니다.")
                continue
                
            # 다운로드 링크 중복 제거
            seen_urls = set()
            unique_downloads = []
            for a in download_anchors:
                url = a['href']
                if url not in seen_urls:
                    seen_urls.add(url)
                    unique_downloads.append(a)
                    
            print(f"  [+] 발견된 다운로드 버전 수: {len(unique_downloads)}개")
            
            # 2. 각 버전별 다운로드 및 주입
            for dl_a in unique_downloads:
                download_url = dl_a['href']
                download_text = dl_a.text.strip()
                print(f"\n  [*] 버전 다운로드 시도: {download_text}")
                print(f"    - URL: {download_url}")
                
                try:
                    dl_res = requests.get(download_url, headers=headers, timeout=30)
                    if dl_res.status_code != 200:
                        print(f"    [-] 다운로드 실패 (HTTP {dl_res.status_code})")
                        continue
                        
                    file_bytes = dl_res.content
                    exe_bytes = None
                    
                    # ZIP / RAR 처리
                    if download_url.endswith('.zip') or file_bytes[:2] == b'PK':
                        with zipfile.ZipFile(io.BytesIO(file_bytes)) as z:
                            for name in z.namelist():
                                if name.endswith('.exe'):
                                    exe_bytes = z.read(name)
                                    break
                    elif file_bytes.startswith(b'Rar!') or download_url.endswith('.rar') or file_bytes[:4] == b'\x52\x61\x72\x21':
                        unrar_path = "UnRAR.exe" if os.path.exists("UnRAR.exe") else "../UnRAR.exe"
                        if not os.path.exists(unrar_path):
                            print("    [-] UnRAR.exe 실행 파일을 찾을 수 없어 RAR 해제를 스킵합니다.")
                            continue
                            
                        with open("temp_trainer.rar", "wb") as f:
                            f.write(file_bytes)
                        try:
                            subprocess.run([unrar_path, "e", "-y", "-inul", "temp_trainer.rar", "*.exe"], check=True)
                            extracted_exe = None
                            for fname in os.listdir("."):
                                if fname.lower().endswith(".exe") and fname.lower() not in ["unrar.exe", "unrarw64.exe"]:
                                    extracted_exe = fname
                                    break
                            if extracted_exe:
                                with open(extracted_exe, "rb") as f:
                                    exe_bytes = f.read()
                                os.remove(extracted_exe)
                        finally:
                            if os.path.exists("temp_trainer.rar"):
                                os.remove("temp_trainer.rar")
                                
                    else:
                        exe_bytes = file_bytes
                        
                    if not exe_bytes or exe_bytes[:2] != b'MZ':
                        print("    [-] 올바른 실행 파일(MZ 헤더)이 아닙니다.")
                        continue
                        
                    # 파일 명세 분석
                    original_file_size = len(exe_bytes)
                    original_file_hash = hashlib.sha256(exe_bytes).hexdigest()
                    print(f"    [+] 해시: {original_file_hash} ({original_file_size} bytes)")
                    
                    # DB 중복 체크
                    trainer_check = db.table('trainers').select('id').eq('original_file_hash', original_file_hash).execute()
                    if trainer_check.data:
                        print("    [*] 이미 등록된 트레이너 해시입니다. 스킵.")
                        continue
                        
                    # PE 헤더 파싱 및 오프셋 검출
                    text_section = parse_pe_binary(exe_bytes)
                    if not text_section:
                        print("    [-] PE 헤더 분석 실패 (.text 섹션 검출 불가)")
                        continue
                        
                    mapping_details = scan_cheat_string_offset(exe_bytes)
                    if not mapping_details:
                        print("    [-] 텍스트 영역 오프셋을 검출하지 못했습니다.")
                        continue
                        
                    # 보안 경계선 검사 (실행 코드 침범 차단)
                    text_start = text_section.PointerToRawData
                    text_end = text_start + text_section.SizeOfRawData
                    if text_start <= mapping_details['offset_dec'] < text_end:
                        print("    [-] 보안 경고: 번역 오프셋이 실행코드(.text) 내부입니다. 주입을 차단합니다.")
                        continue
                        
                    # 다운로드 텍스트에서 버전 및 치트 옵션 개수 파싱
                    v_match = re.search(r'v[0-9\.]+(?:-v[0-9\.]+)?', download_text)
                    version_str = v_match.group(0) if v_match else "v1.0"
                    opt_match = re.search(r'Plus\.(\d+)', download_text)
                    option_count = int(opt_match.group(1)) if opt_match else 0
                    final_version_str = f"{version_str} Plus {option_count}"
                    
                    # 3. 트레이너 삽입
                    insert_trainer = db.table('trainers').insert({
                        'game_id': game_id,
                        'version_str': final_version_str,
                        'option_count': option_count,
                        'original_file_hash': original_file_hash,
                        'original_file_size': original_file_size,
                        'is_packed': False
                    }).execute()
                    
                    if not insert_trainer.data:
                        print("    [-] 트레이너 삽입 실패")
                        continue
                        
                    trainer_id = insert_trainer.data[0]['id']
                    print(f"    [+] 트레이너 ID {trainer_id} 생성 완료.")
                    
                    # 4. 한국어(ko) 번역본 생성 및 주입
                    translated_ko = process_translation_block(mapping_details['original_text'], db)
                    db.table('translation_mappings').insert({
                        'trainer_id': trainer_id,
                        'offset_dec': mapping_details['offset_dec'],
                        'encoding': mapping_details['encoding'],
                        'original_text': mapping_details['original_text'].replace('\x00', '').replace('\u0000', ''),
                        'translated_text': translated_ko.replace('\x00', '').replace('\u0000', ''),
                        'max_char_len': mapping_details['max_char_len'],
                        'language_code': 'ko',
                        'is_approved': True
                    }).execute()
                    
                    # 5. 일본어(ja) 번역본 생성 및 주입
                    translated_ja = process_translation_block_ja(mapping_details['original_text'], db)
                    db.table('translation_mappings').insert({
                        'trainer_id': trainer_id,
                        'offset_dec': mapping_details['offset_dec'],
                        'encoding': mapping_details['encoding'],
                        'original_text': mapping_details['original_text'].replace('\x00', '').replace('\u0000', ''),
                        'translated_text': translated_ja.replace('\x00', '').replace('\u0000', ''),
                        'max_char_len': mapping_details['max_char_len'],
                        'language_code': 'ja',
                        'is_approved': True
                    }).execute()
                    
                    print(f"    [+] 한글 및 일어 번역 매핑(ko/ja) 주입 완료!")
                    
                except Exception as e:
                    print(f"    [-] 버전 처리 중 예외 발생: {e}")
                    
        except Exception as e:
            print(f"  [-] 게임 {title} 처리 중 예외 발생: {e}")

if __name__ == "__main__":
    main()
