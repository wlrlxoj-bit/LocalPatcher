import os
import re
import sys
import json
import time
import hashlib
import zipfile
import io
import argparse
import subprocess
import requests
from bs4 import BeautifulSoup
import pefile
from supabase import create_client, Client

sys.stdout.reconfigure(encoding='utf-8')

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env.local'), override=True)

# Environment variables setup
SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")

# Dictionary of common static translations as fallback
COMMON_TRANSLATIONS = {
    "infinite health": "무한 체력",
    "infinite hp": "무한 체력",
    "infinite stamina": "무한 스태미나",
    "infinite items/ammo": "무한 아이템/탄약",
    "items won't decrease": "아이템 감소 방지",
    "healing items no cooldown": "회복 아이템 쿨타임 제거",
    "grenades no cooldown": "수류탄 쿨타임 제거",
    "no reload": "재장전 없음",
    "super accuracy": "초정밀 사격",
    "no recoil": "반동 없음",
    "one hit kill": "원샷원킬",
    "damage multiplier": "데미지 배율 설정",
    "defense multiplier": "방어력 배율 설정",
    "stealth mode": "은신 모드",
    "edit money": "보유 돈 편집",
    "infinite xp": "무한 경험치",
    "xp multiplier": "경험치 획득 배율",
    "infinite street cred": "무한 길거리 평판",
    "street cred multiplier": "길거리 평판 배율",
    "max skill xp/progression": "스킬 레벨 최대화 (진행도)",
    "skill xp multiplier": "스킬 경험치 배율",
    "edit attribute points": "특성 포인트 편집",
    "edit perk points": "특전 포인트 편집",
    "edit relic points": "릴릭 포인트 편집",
    "ignore cyberware capacity": "사이버웨어 용량 제한 무시",
    "set game speed": "게임 속도 조절",
    "infinite ram": "무한 RAM",
    "freeze breach protocol timer": "침투 프로토콜 타이머 고정",
    "infinite components": "무한 제작 부품",
    "infinite quickhack components": "무한 퀵핵 부품",
    "edit max carrying weight": "최대 휴대 용량 편집",
    "set movement speed": "이동 속도 설정",
    "super jump": "슈퍼 점프",
    "infinite double jumps": "무한 이단 점프",
    "edit player level": "플레이어 레벨 편집",
    "edit street cred level": "길거리 평판 레벨 편집",
    "freeze daytime": "시간 흐름 고정",
    "daytime +1 hour": "시간 1시간 전진",
    "god mode/ignore hits": "갓 모드/피격 무시",
    "infinite fp": "무한 FP",
    "zero weight": "무게 제로",
    "infinite item usage": "무한 아이템 사용",
    "100% drop rate": "드롭율 100%",
    "immune to all negative status": "모든 디버프 면역",
    "super damage/one hit kill": "슈퍼 데미지/원샷원킬",
    "infinite horse hp": "무한 탈것 HP",
    "edit runes": "룬 편집",
    "runes multiplier": "룬 획득 배율",
    "won't lose runes when player dies": "사망 시 룬 분실 방지",
    "enable fly mode": "비행 모드 활성화",
    "fly up": "비행 상승",
    "fly down": "비행 하강",
    "freeze enemies position": "적 위치 고정",
    "edit level": "레벨 에디트",
    "edit vigor": "생명력 에디트",
    "edit mind": "정신력 에디트",
    "edit endurance": "지구력 에디트",
    "edit strength": "근력 에디트",
    "edit dexterity": "기량 에디트",
    "edit intelligence": "지력 에디트",
    "edit faith": "신앙 에디트",
    "edit arcane": "신비 에디트",
    "edit max hp": "최대 HP 에디트",
    "edit max fp": "최대 FP 에디트",
    "edit max stamina": "최대 스태미나 에디트",
    "edit player stats": "스탯 에디터",
    "check for updates": "업데이트 확인"
}

db_dictionary_ko = {}
db_dictionary_ja = {}

def save_new_translations_to_dictionary(original_line: str, translated_line: str, db: Client):
    """Extracts clean option labels and inserts them into Supabase 'common_dictionary' table."""
    try:
        pattern = r"^([a-zA-Z0-9\+\s\.\-\*\/↑↓←→]+)\s*-\s*([^\*]+)(.*)$"
        match_orig = re.match(pattern, original_line.strip())
        match_trans = re.match(pattern, translated_line.strip())
        if match_orig and match_trans:
            eng_label = match_orig.group(2).strip()
            kor_label = match_trans.group(2).strip()
            eng_lower = eng_label.lower().replace("'", "").strip()
            
            if eng_lower not in db_dictionary_ko and eng_lower not in COMMON_TRANSLATIONS:
                db.table('common_dictionary').insert({
                    'english_term': eng_label,
                    'korean_translation': kor_label
                }).execute()
                db_dictionary_ko[eng_lower] = kor_label
                print(f"[+] Learned new term: '{eng_label}' -> '{kor_label}'")
    except Exception:
        pass

def translate_via_llm(lines_to_translate):
    """Sends a batch of untranslated lines to Gemini or OpenAI API in JSON mode."""
    if not lines_to_translate:
        return {}

    prompt = f"""
    You are a professional game localization expert.
    Translate the following list of game trainer cheat options into natural, standard Korean used by Korean gamers.
    
    CRITICAL RULES:
    1. KEEP the exact hotkey prefix (e.g. "Num 1 -", "Ctrl+Num 1 -", "Alt+Num 1 -") unchanged.
    2. Translate only the description label and any note texts (e.g. Translate "Infinite HP" to "무한 체력").
    3. Return your output strictly as a JSON object with a single key "translations" containing an array of translated strings in the EXACT same order.
    
    List to translate:
    {json.dumps(lines_to_translate, ensure_ascii=False)}
    """
    
    if GEMINI_API_KEY:
        try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key={GEMINI_API_KEY}"
            payload = {
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {
                    "responseMimeType": "application/json"
                }
            }
            res = requests.post(url, json=payload, timeout=15)
            if res.status_code == 200:
                res_data = res.json()
                text_response = res_data["candidates"][0]["content"]["parts"][0]["text"]
                translated_array = json.loads(text_response).get("translations", [])
                if len(translated_array) == len(lines_to_translate):
                    return dict(zip(lines_to_translate, translated_array))
        except Exception as e:
            print(f"[-] Gemini API translation failed: {e}")

    if OPENAI_API_KEY:
        try:
            url = "https://api.openai.com/v1/chat/completions"
            headers = {
                "Authorization": f"Bearer {OPENAI_API_KEY}",
                "Content-Type": "application/json"
            }
            payload = {
                "model": "gpt-4.1-mini",
                "messages": [
                    {"role": "system", "content": "You are a helpful localization assistant."},
                    {"role": "user", "content": prompt}
                ],
                "response_format": {"type": "json_object"}
            }
            res = requests.post(url, headers=headers, json=payload, timeout=15)
            if res.status_code == 200:
                res_data = res.json()
                text_response = res_data["choices"][0]["message"]["content"]
                translated_array = json.loads(text_response).get("translations", [])
                if len(translated_array) == len(lines_to_translate):
                    return dict(zip(lines_to_translate, translated_array))
        except Exception as e:
            print(f"[-] OpenAI API translation failed: {e}")

    return {}

def translate_line(line: str):
    """Attempts dictionary translation for a single line. Returns None if it needs LLM translation."""
    pattern = r"^([a-zA-Z0-9\+\s\.\-\*\/↑↓←→]+)\s*-\s*([^\*]+)(.*)$"
    match = re.match(pattern, line.strip())
    if not match:
        return line
    
    hotkey = match.group(1).strip()
    label = match.group(2).strip()
    notes = match.group(3).strip()
    
    label_lower = label.lower().replace("'", "").strip()
    
    translated_label = None
    if label_lower in db_dictionary_ko:
        translated_label = db_dictionary_ko[label_lower]
    elif label_lower in COMMON_TRANSLATIONS:
        translated_label = COMMON_TRANSLATIONS[label_lower]
        
    if translated_label is not None:
        translated_notes = ""
        if notes:
            notes_lower = notes.lower()
            if "takes effect" in notes_lower:
                translated_notes = " **효과 적용 시 수치가 갱신됩니다."
            elif "activate before" in notes_lower:
                translated_notes = " **사용하기 전에 활성화하십시오."
            else:
                translated_notes = notes
                
        return f"{hotkey} - {translated_label}{translated_notes}"
    
    return None

def process_translation_block(text: str, db: Client) -> str:
    """Splits options block, translates each line, and space-pads to synchronize lengths."""
    lines = text.split("\n")
    dict_results = []
    lines_needing_llm = []

    for line in lines:
        if not line or line.strip() == "":
            dict_results.append(line)
            continue
            
        trans_line = translate_line(line)
        if trans_line is not None:
            dict_results.append(trans_line)
        else:
            dict_results.append(None)
            lines_needing_llm.append(line)

    llm_map = {}
    if lines_needing_llm and (GEMINI_API_KEY or OPENAI_API_KEY):
        llm_map = translate_via_llm(lines_needing_llm)

    translated_lines = []
    for idx, line in enumerate(lines):
        if not line or line.strip() == "":
            translated_lines.append(line)
            continue
            
        orig_len = len(line)
        trans_line = dict_results[idx]
        if trans_line is None:
            trans_line = llm_map.get(line, line)
            if trans_line != line:
                save_new_translations_to_dictionary(line, trans_line, db)

        if len(trans_line) < orig_len:
            trans_line += " " * (orig_len - len(trans_line))
        elif len(trans_line) > orig_len:
            trans_line = trans_line[:orig_len]
            
        translated_lines.append(trans_line)
        
    return "\n".join(translated_lines)

def translate_line_ja(line: str):
    """Attempts Japanese dictionary translation for a single line. Returns None if it needs LLM translation."""
    pattern = r"^([a-zA-Z0-9\+\s\.\-\*\/↑↓←→]+)\s*-\s*([^\*]+)(.*)$"
    match = re.match(pattern, line.strip())
    if not match:
        return line
    
    hotkey = match.group(1).strip()
    label = match.group(2).strip()
    notes = match.group(3).strip()
    
    label_lower = label.lower().replace("'", "").strip()
    
    translated_label = None
    if label_lower in db_dictionary_ja:
        translated_label = db_dictionary_ja[label_lower]
        
    if translated_label is not None:
        translated_notes = ""
        if notes:
            notes_lower = notes.lower()
            if "takes effect" in notes_lower:
                translated_notes = " **効果適用時に反映"
            elif "activate before" in notes_lower:
                translated_notes = " **使用前有効化"
            else:
                translated_notes = notes
                
        return f"{hotkey} - {translated_label}{translated_notes}"
    
    return None

def translate_via_llm_ja(lines_to_translate):
    """Sends a batch of untranslated lines to OpenAI API in JSON mode for Japanese."""
    if not lines_to_translate:
        return {}

    prompt = f"""
    You are a professional game localization expert.
    Translate the following list of game trainer cheat options into natural, standard Japanese used by Japanese gamers.
    
    CRITICAL RULES:
    1. KEEP the exact hotkey prefix (e.g. "Num 1 -", "Ctrl+Num 1 -", "Alt+Num 1 -") unchanged.
    2. Translate only the description label and any note texts (e.g. Translate "Infinite HP" to "体力無限" or "無限体力").
    3. Return your output strictly as a JSON object with a single key "translations" containing an array of translated strings in the EXACT same order.
    
    List to translate:
    {json.dumps(lines_to_translate, ensure_ascii=False)}
    """

    if OPENAI_API_KEY:
        try:
            print("[*] Calling OpenAI API (gpt-4.1-mini) for batch translation to Japanese...")
            url = "https://api.openai.com/v1/chat/completions"
            headers = {
                "Authorization": f"Bearer {OPENAI_API_KEY}",
                "Content-Type": "application/json"
            }
            payload = {
                "model": "gpt-4.1-mini",
                "messages": [
                    {"role": "system", "content": "You are a helpful localization assistant."},
                    {"role": "user", "content": prompt}
                ],
                "response_format": {"type": "json_object"}
            }
            res = requests.post(url, headers=headers, json=payload, timeout=15)
            if res.status_code == 200:
                res_data = res.json()
                text_response = res_data["choices"][0]["message"]["content"]
                translated_array = json.loads(text_response).get("translations", [])
                if len(translated_array) == len(lines_to_translate):
                    return dict(zip(lines_to_translate, translated_array))
        except Exception as e:
            print(f"[-] OpenAI API translation failed: {e}")

    return {}

def process_translation_block_ja(text: str, db: Client) -> str:
    """Splits options block, translates each line to Japanese, and space-pads to synchronize lengths."""
    lines = text.split("\n")
    dict_results = []
    lines_needing_llm = []

    for line in lines:
        if not line or line.strip() == "":
            dict_results.append(line)
            continue
            
        trans_line = translate_line_ja(line)
        if trans_line is not None:
            dict_results.append(trans_line)
        else:
            dict_results.append(None)
            lines_needing_llm.append(line)

    llm_map = {}
    if lines_needing_llm and OPENAI_API_KEY:
        llm_map = translate_via_llm_ja(lines_needing_llm)

    translated_lines = []
    for idx, line in enumerate(lines):
        if not line or line.strip() == "":
            translated_lines.append(line)
            continue
            
        orig_len = len(line)
        trans_line = dict_results[idx]
        if trans_line is None:
            trans_line = llm_map.get(line, line)

        if len(trans_line) < orig_len:
            trans_line += " " * (orig_len - len(trans_line))
        elif len(trans_line) > orig_len:
            trans_line = trans_line[:orig_len]
            
        translated_lines.append(trans_line)
        
    return "\n".join(translated_lines)

def parse_pe_binary(exe_bytes: bytes):
    """Parses PE sections using pefile to find .text boundary."""
    try:
        pe = pefile.PE(data=exe_bytes)
        text_section = None
        for section in pe.sections:
            if b'.text' in section.Name:
                text_section = section
                break
        return text_section
    except Exception as e:
        print(f"[-] PE Header parsing failed: {e}")
        return None

def scan_cheat_string_offset(exe_bytes: bytes):
    """Scans binary to locate cheat options block offset."""
    patterns = {
        'UTF-16LE': b'N\x00u\x00m\x00 \x001\x00 \x00-\x00',
        'ASCII': b'Num 1 -'
    }
    
    for encoding, pattern in patterns.items():
        offset = exe_bytes.find(pattern)
        if offset != -1:
            start_offset = offset
            limit = max(0, offset - 1000)
            
            if encoding == 'UTF-16LE':
                while start_offset > limit:
                    if exe_bytes[start_offset:start_offset+4] == b'\n\x00\n\x00':
                        start_offset += 4
                        break
                    start_offset -= 2
            else:
                while start_offset > limit:
                    if exe_bytes[start_offset:start_offset+2] == b'\n\n':
                        start_offset += 2
                        break
                    start_offset -= 1
            
            end_offset = offset
            max_limit = min(len(exe_bytes), offset + 8000)
            
            if encoding == 'UTF-16LE':
                while end_offset < max_limit:
                    if exe_bytes[end_offset:end_offset+4] == b'\x00\x00\x00\x00':
                        break
                    end_offset += 2
            else:
                while end_offset < max_limit:
                    if exe_bytes[end_offset:end_offset+2] == b'\x00\x00':
                        break
                    end_offset += 1
                    
            max_char_len = (end_offset - start_offset) // (2 if encoding == 'UTF-16LE' else 1)
            raw_bytes = exe_bytes[start_offset:end_offset]
            original_text = raw_bytes.decode(encoding, errors='ignore').replace('\x00', '').replace('\u0000', '')
            
            return {
                'offset_dec': start_offset,
                'encoding': encoding,
                'max_char_len': max_char_len,
                'original_text': original_text
            }
            
    return None

def fetch_steam_meta(game_title_en: str):
    """Searches Steam Store API to retrieve Korean title and app cover image."""
    default_meta = {
        'title_ko': game_title_en,
        'cover_url': 'https://flingtrainer.com/wp-content/uploads/2021/01/default_cover.jpg'
    }
    
    # Strip version suffix / branding elements
    clean_title = re.sub(r'(?:v\d+\.\d+|\bPlus\b|\bTrainer\b|\bFLiNG\b)', '', game_title_en, flags=re.IGNORECASE).strip()
    search_url = f"https://store.steampowered.com/api/storesearch/?term={requests.utils.quote(clean_title)}&l=korean&cc=KR"
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
    
    try:
        res = requests.get(search_url, headers=headers, timeout=10)
        if res.status_code == 200:
            data = res.json()
            if data.get('items'):
                item = data['items'][0]
                appid = item['id']
                title_ko = item['name']
                cover_url = f"https://cdn.cloudflare.steamstatic.com/steam/apps/{appid}/header.jpg"
                print(f"[+] Steam Match: {title_ko} (AppID: {appid})")
                return {'title_ko': title_ko, 'cover_url': cover_url}
    except Exception as e:
        print(f"[-] Steam search failed: {e}")
        
    return default_meta

def fetch_sitemap_trainer_urls():
    """Parses post-sitemap.xml and returns all game trainer URLs."""
    url = "https://flingtrainer.com/post-sitemap.xml"
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
    print("[*] Fetching post-sitemap.xml...")
    response = requests.get(url, headers=headers, timeout=15)
    if response.status_code != 200:
        print("[-] Failed to fetch sitemap.")
        return []
    
    urls = re.findall(r'<loc>(https://flingtrainer.com/trainer/[^<]+)</loc>', response.text)
    return urls

def process_archive_trainer(game_url, db: Client, delay_sec=1.0, force=False):
    """Scrapes game trainer page, extracts all download links, downloads and registers them."""
    slug = game_url.rstrip('/').split('/')[-1]
    title_raw = slug.replace('-trainer', '').replace('-', ' ').title()
    print(f"\n[*] Processing game: {title_raw} ({game_url})")
    
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
    
    try:
        response = requests.get(game_url, headers=headers, timeout=10)
        if response.status_code != 200:
            print(f"[-] Failed to load game page: {response.status_code}")
            return False
            
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # Select all download anchors
        download_anchors = soup.select('a[href*="/downloads/"]')
        if not download_anchors:
            print("[-] No download links found on page.")
            return False
            
        # Deduplicate URLs
        seen_urls = set()
        unique_downloads = []
        for a in download_anchors:
            url = a['href']
            if url not in seen_urls:
                seen_urls.add(url)
                unique_downloads.append(a)
                
        # Resolve game_id
        game_res = db.table('games').select('id', 'slug').eq('slug', slug).execute()
        
        game_row = None
        if game_res.data:
            game_row = game_res.data[0]
        else:
            title_res = db.table('games').select('id', 'slug').eq('title_en', title_raw).execute()
            if title_res.data:
                game_row = title_res.data[0]

        if game_row:
            game_id = game_row['id']
            if game_row['slug'] != slug:
                print(f"[*] Updating slug for game '{title_raw}' from '{game_row['slug']}' to '{slug}'")
                db.table('games').update({'slug': slug}).eq('id', game_id).execute()
                
            # Optimization: check if all versions are already registered in the DB
            db_trainers = db.table('trainers').select('id').eq('game_id', game_id).execute()
            if not force and len(db_trainers.data) >= len(unique_downloads):
                print(f"[+] Skipping {slug}: all {len(unique_downloads)} versions are already registered.")
                return True
        else:
            # Create new game meta
            steam_meta = fetch_steam_meta(title_raw)
            insert_game = db.table('games').insert({
                'title_en': title_raw,
                'title_ko': steam_meta['title_ko'],
                'slug': slug,
                'cover_image_url': steam_meta['cover_url'],
                'anti_cheat': 'none',
                'fling_url': game_url
            }).execute()
            if not insert_game.data:
                print("[-] Failed to create game metadata.")
                return False
            game_id = insert_game.data[0]['id']

        # Process each version
        for download_a in unique_downloads:
            download_url = download_a['href']
            download_text = download_a.text.strip()
            print(f"  [*] Checking version: {download_text}")
            
            time.sleep(delay_sec)  # Rate limiting safety delay
            
            try:
                original_file_hash = None
                
                # Check if trainer already exists (we fetch hash by performing HEAD or download)
                # But since hash is calculated from bytes, we download it.
                # To prevent downloading if version name already registered, we check version count first.
                dl_response = requests.get(download_url, headers=headers, timeout=20)
                if dl_response.status_code != 200:
                    continue
                    
                file_bytes = dl_response.content
                exe_bytes = None
                
                if download_url.endswith('.zip') or file_bytes[:2] == b'PK':
                    with zipfile.ZipFile(io.BytesIO(file_bytes)) as z:
                        for name in z.namelist():
                            if name.endswith('.exe'):
                                exe_bytes = z.read(name)
                                break
                elif file_bytes.startswith(b'Rar!') or download_url.endswith('.rar'):
                    unrar_path = None
                    if os.path.exists("UnRAR.exe"):
                        unrar_path = "UnRAR.exe"
                    elif os.path.exists("../UnRAR.exe"):
                        unrar_path = "../UnRAR.exe"
                    
                    if not unrar_path:
                        print("[-] Warning: UnRAR.exe not found. Skipping trainer.")
                        continue
                    
                    try:
                        with open("temp_trainer.rar", "wb") as f:
                            f.write(file_bytes)
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
                        else:
                            print("[-] Extracted executable not found.")
                    except Exception as e:
                        print(f"[-] RAR extraction failed: {e}")
                    finally:
                        if os.path.exists("temp_trainer.rar"):
                            os.remove("temp_trainer.rar")
                        # Clean up any leftover extracted exe files in the current directory
                        for fname in os.listdir("."):
                            if fname.lower().endswith(".exe") and fname.lower() not in ["unrar.exe", "unrarw64.exe"]:
                                try:
                                    os.remove(fname)
                                except Exception:
                                    pass
                else:
                    exe_bytes = file_bytes
                    
                if not exe_bytes or exe_bytes[:2] != b'MZ':
                    continue
                    
                original_file_size = len(exe_bytes)
                original_file_hash = hashlib.sha256(exe_bytes).hexdigest()
                
                # Check if trainer already exists
                trainer_res = db.table('trainers').select('id').eq('original_file_hash', original_file_hash).execute()
                if trainer_res.data:
                    trainer_id = trainer_res.data[0]['id']
                    # Check if it has any translation mappings
                    mappings_res = db.table('translation_mappings').select('id').eq('trainer_id', trainer_id).execute()
                    if mappings_res.data and len(mappings_res.data) > 0:
                        print(f"    [*] Skip/Protect: Trainer ID {trainer_id} has existing translation mappings. Skipping overwrite.")
                        continue

                    if not force:
                        print(f"    [*] Already registered: {original_file_hash}")
                        continue
                    else:
                        print(f"    [*] Force mode: deleting existing mappings and trainer ID {trainer_id} to overwrite...")
                        db.table('translation_mappings').delete().eq('trainer_id', trainer_id).execute()
                        db.table('trainers').delete().eq('id', trainer_id).execute()
                    
                text_section = parse_pe_binary(exe_bytes)
                if not text_section:
                    continue
                    
                mapping_details = scan_cheat_string_offset(exe_bytes)
                if not mapping_details:
                    continue
                    
                # Security boundary check
                text_start = text_section.PointerToRawData
                text_end = text_start + text_section.SizeOfRawData
                if text_start <= mapping_details['offset_dec'] < text_end:
                    print("    [-] Security Block: Mapping inside executable .text section.")
                    continue
                    
                # Parsing version and option count
                v_match = re.search(r'v[0-9\.]+(?:-v[0-9\.]+)?', download_text)
                version_str = v_match.group(0) if v_match else "v1.0"
                
                opt_match = re.search(r'Plus\.(\d+)', download_text)
                option_count = int(opt_match.group(1)) if opt_match else 0
                
                final_version_str = f"{version_str} Plus {option_count}"
                
                # Insert trainer metadata
                insert_trainer = db.table('trainers').insert({
                    'game_id': game_id,
                    'version_str': final_version_str,
                    'option_count': option_count,
                    'original_file_hash': original_file_hash,
                    'original_file_size': original_file_size,
                    'is_packed': False
                }).execute()
                
                if not insert_trainer.data:
                    continue
                trainer_id = insert_trainer.data[0]['id']
                
                # Translate block
                translated_text_ko = process_translation_block(mapping_details['original_text'], db)
                translated_text_ja = process_translation_block_ja(mapping_details['original_text'], db)
                
                # Insert translation mapping
                clean_orig_text = mapping_details['original_text'].replace('\x00', '').replace('\u0000', '')
                
                db.table('translation_mappings').insert({
                    'trainer_id': trainer_id,
                    'offset_dec': mapping_details['offset_dec'],
                    'encoding': mapping_details['encoding'],
                    'original_text': clean_orig_text,
                    'translated_text': translated_text_ko.replace('\x00', '').replace('\u0000', ''),
                    'max_char_len': mapping_details['max_char_len'],
                    'language_code': 'ko',
                    'is_approved': True
                }).execute()
                
                db.table('translation_mappings').insert({
                    'trainer_id': trainer_id,
                    'offset_dec': mapping_details['offset_dec'],
                    'encoding': mapping_details['encoding'],
                    'original_text': clean_orig_text,
                    'translated_text': translated_text_ja.replace('\x00', '').replace('\u0000', ''),
                    'max_char_len': mapping_details['max_char_len'],
                    'language_code': 'ja',
                    'is_approved': True
                }).execute()
                
                print(f"    [+] Successfully registered: {final_version_str} (Trainer ID: {trainer_id})")
                
            except Exception as e:
                print(f"    [-] Error processing version {download_text}: {e}")
                
        return True
    except Exception as e:
        print(f"[-] Error parsing game url {game_url}: {e}")
        return False

def main():
    parser = argparse.ArgumentParser(description="FLiNG Trainer Archive Full Crawler")
    parser.add_argument("--limit", type=int, default=10, help="Maximum number of new games to crawl in this run")
    parser.add_argument("--delay", type=float, default=1.0, help="Rate limit delay in seconds between downloads")
    parser.add_argument("--force", action="store_true", help="Force re-processing and overwriting of existing trainers")
    args = parser.parse_args()
    
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("[-] Supabase environment credentials not configured.")
        sys.exit(1)
        
    db: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
    print(f"[*] Starting Archive Scraper (Limit: {args.limit} games, Delay: {args.delay}s)...")
    
    # Load dynamic dictionary from Supabase
    try:
        res = db.table('common_dictionary').select('english_term, korean_translation, translated_ja').execute()
        if res.data:
            for row in res.data:
                eng_key = row['english_term'].lower().strip()
                db_dictionary_ko[eng_key] = row['korean_translation']
                if row.get('translated_ja'):
                    db_dictionary_ja[eng_key] = row['translated_ja']
            print(f"[+] Loaded {len(db_dictionary_ko)} KO and {len(db_dictionary_ja)} JA translations from database.")
    except Exception as e:
        print(f"[*] Dynamic dictionary not active, fallback to static defaults. Error: {e}")
        
    # Get all post URLs from sitemap
    game_urls = fetch_sitemap_trainer_urls()
    if not game_urls:
        print("[-] Sitemap URLs empty. Exiting.")
        return
        
    print(f"[+] Sitemap contains {len(game_urls)} total URLs.")
    
    processed_count = 0
    for game_url in game_urls:
        if processed_count >= args.limit:
            print(f"\n[*] Reached batch limit of {args.limit} games. Stopping.")
            break
            
        success = process_archive_trainer(game_url, db, delay_sec=args.delay, force=args.force)
        if success:
            slug = game_url.rstrip('/').split('/')[-1]
            game_res = db.table('games').select('id').eq('slug', slug).execute()
            if game_res.data:
                processed_count += 1
                
    print("\n[+] Archive scraping run finished.")

if __name__ == "__main__":
    main()
