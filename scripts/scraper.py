import os
import re
import sys
import json
import hashlib
import zipfile
import io
import requests
from bs4 import BeautifulSoup
import pefile
from supabase import create_client, Client

# Environment variables setup
SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
# Use Service Role Key for writing to DB securely in backend workflows, fallback to Anon Key
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")

# Dictionary of common trainer translations for cost-free instant translation mapping
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

# Dynamic in-memory dictionary loaded from database
db_dictionary = {}

def save_new_translations_to_dictionary(original_line: str, translated_line: str, db: Client):
    """Extracts clean option labels and inserts them into Supabase 'common_dictionary' table to dynamically train the database dictionary."""
    try:
        pattern = r"^([a-zA-Z0-9\+\s\.\-\*\/↑↓←→]+)\s*-\s*([^\*]+)(.*)$"
        match_orig = re.match(pattern, original_line.strip())
        match_trans = re.match(pattern, translated_line.strip())
        if match_orig and match_trans:
            eng_label = match_orig.group(2).strip()
            kor_label = match_trans.group(2).strip()
            eng_lower = eng_label.lower().replace("'", "").strip()
            
            if eng_lower not in db_dictionary and eng_lower not in COMMON_TRANSLATIONS:
                # Insert to Supabase common_dictionary table
                db.table('common_dictionary').insert({
                    'english_term': eng_label,
                    'korean_translation': kor_label
                }).execute()
                db_dictionary[eng_lower] = kor_label
                print(f"[+] Dynamic Dictionary Learned: '{eng_label}' -> '{kor_label}'")
    except Exception as e:
        # Silently fail if table doesn't exist or duplicate key error occurs
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

    # 1. Try Gemini API
    if GEMINI_API_KEY:
        try:
            print("[*] Calling Gemini API for batch translation...")
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

    # 2. Try OpenAI API
    if OPENAI_API_KEY:
        try:
            print("[*] Calling OpenAI API (gpt-4o-mini) for batch translation...")
            url = "https://api.openai.com/v1/chat/completions"
            headers = {
                "Authorization": f"Bearer {OPENAI_API_KEY}",
                "Content-Type": "application/json"
            }
            payload = {
                "model": "gpt-4o-mini",
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

    # If both APIs fail or are unconfigured, return empty mapping (fallback to original English)
    return {}

def translate_line(line: str):
    """Attempts dictionary translation for a single line. Returns None if it needs LLM translation."""
    pattern = r"^([a-zA-Z0-9\+\s\.\-\*\/↑↓←→]+)\s*-\s*([^\*]+)(.*)$"
    match = re.match(pattern, line.strip())
    if not match:
        return line  # Keep headers or notes as-is
    
    hotkey = match.group(1).strip()
    label = match.group(2).strip()
    notes = match.group(3).strip()
    
    label_lower = label.lower().replace("'", "").strip()
    
    # Check dynamic database dictionary first, then fallback to local static dict
    translated_label = None
    if label_lower in db_dictionary:
        translated_label = db_dictionary[label_lower]
    elif label_lower in COMMON_TRANSLATIONS:
        translated_label = COMMON_TRANSLATIONS[label_lower]
        
    if translated_label is not None:
        # Simple notes translation lookup
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
    
    # Return None to indicate it requires LLM translation
    return None

def process_translation_block(text: str, db: Client) -> str:
    """Splits a multi-line options string, translates each line (Dictionary + LLM Fallback), and pads with spaces."""
    lines = text.split("\n")
    dict_results = []
    lines_needing_llm = []

    # First Pass: Translate using dictionary. Track unmapped lines.
    for line in lines:
        if not line or line.strip() == "":
            dict_results.append(line)
            continue
            
        trans_line = translate_line(line)
        if trans_line is not None:
            dict_results.append(trans_line)
        else:
            dict_results.append(None) # Marker for LLM translate
            lines_needing_llm.append(line)

    # Second Pass: Perform batch LLM translation if keys are set
    llm_map = {}
    if lines_needing_llm and (GEMINI_API_KEY or OPENAI_API_KEY):
        llm_map = translate_via_llm(lines_needing_llm)

    # Third Pass: Assemble and apply Space Padding to synchronize lengths
    translated_lines = []
    for idx, line in enumerate(lines):
        if not line or line.strip() == "":
            translated_lines.append(line)
            continue
            
        orig_len = len(line)
        
        # Get translation from first pass or fallback to LLM / original
        trans_line = dict_results[idx]
        if trans_line is None:
            # Check if LLM mapped it, otherwise fallback to original line
            trans_line = llm_map.get(line, line)
            # Save newly translated term to dynamic dictionary table for self-learning caching
            if trans_line != line:
                save_new_translations_to_dictionary(line, trans_line, db)

        # Apply Space Padding to synchronize string length in bytes/chars
        if len(trans_line) < orig_len:
            trans_line += " " * (orig_len - len(trans_line))
        elif len(trans_line) > orig_len:
            # Safely truncate to prevent adjacent memory override (Buffer Overflow protection)
            trans_line = trans_line[:orig_len]
            
        translated_lines.append(trans_line)
        
    return "\n".join(translated_lines)

def parse_pe_binary(exe_bytes: bytes):
    """Parses PE header to verify safety and extract .text section boundaries."""
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
    """Scans binary to detect the offset, encoding, and capacity of the hotkey options block."""
    # Look for hotkey signatures in both UTF-16LE and ASCII formats
    patterns = {
        'UTF-16LE': b'N\x00u\x00m\x00 \x001\x00 \x00-\x00',
        'ASCII': b'Num 1 -'
    }
    
    for encoding, pattern in patterns.items():
        offset = exe_bytes.find(pattern)
        if offset != -1:
            print(f"[+] Found hotkey signature pattern in {encoding} at offset {offset}")
            
            # Trace backwards to locate start of string (usually preceded by double newlines or nulls)
            start_offset = offset
            limit = max(0, offset - 1000)
            
            if encoding == 'UTF-16LE':
                # Trace back UTF-16LE newlines \n\n (\n is \n\x00)
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
            
            # Trace forwards to calculate total string capacity/buffer limit
            end_offset = offset
            max_limit = min(len(exe_bytes), offset + 8000)
            
            if encoding == 'UTF-16LE':
                while end_offset < max_limit:
                    # Check for double null terminal block
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
            original_text = raw_bytes.decode(encoding, errors='ignore')
            
            return {
                'offset_dec': start_offset,
                'encoding': encoding,
                'max_char_len': max_char_len,
                'original_text': original_text
            }
            
    return None

def fetch_recent_trainers():
    """Scrapes FLiNG home page to detect recently posted/updated trainers."""
    url = "https://flingtrainer.com/"
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
    
    try:
        response = requests.get(url, headers=headers, timeout=10)
        if response.status_code != 200:
            print(f"[-] Failed to scrape FLiNG index page: {response.status_code}")
            return []
            
        soup = BeautifulSoup(response.text, 'html.parser')
        trainer_posts = []
        
        # Scrape post title links
        for a in soup.select('h2 a'):
            title = a.text.strip()
            link = a['href']
            # Match games like "Cyberpunk 2077 v2.0 Trainer"
            if "trainer" in link:
                slug = link.split('/')[-2].replace("-trainer", "")
                trainer_posts.append({
                    'title': title,
                    'link': link,
                    'slug': slug
                })
        return trainer_posts
    except Exception as e:
        print(f"[-] Error scraping FLiNG feed: {e}")
        return []

def fetch_steam_meta(game_title: str):
    """Queries Steam Store Search and App Details APIs to fetch appid, cover art, and official Korean title."""
    default_meta = {
        'appid': '1091500',
        'title_ko': game_title,
        'cover_url': '/images/default_cover.jpg'
    }
    try:
        print(f"[*] Searching Steam store details for: {game_title}...")
        # Step 1: Search for game AppID
        search_url = f"https://store.steampowered.com/api/storesearch/?term={requests.utils.quote(game_title)}&l=english&cc=US"
        res = requests.get(search_url, timeout=5)
        if res.status_code == 200:
            search_data = res.json()
            items = search_data.get("items", [])
            if items:
                appid = str(items[0]["id"])
                title_en = items[0]["name"]
                
                # Step 2: Fetch Korean details
                details_url = f"https://store.steampowered.com/api/appdetails?appids={appid}&l=korean"
                d_res = requests.get(details_url, timeout=5)
                title_ko = title_en  # fallback
                if d_res.status_code == 200:
                    d_data = d_res.json()
                    if d_data.get(appid, {}).get("success"):
                        title_ko = d_data[appid]["data"]["name"]
                        # Clean up formatting symbols
                        title_ko = title_ko.replace("®", "").replace("™", "").strip()
                        
                cover_url = f"https://cdn.cloudflare.steamstatic.com/steam/apps/{appid}/header.jpg"
                print(f"[+] Found Steam AppID: {appid}, Korean Name: {title_ko}")
                return {
                    'appid': appid,
                    'title_ko': title_ko,
                    'cover_url': cover_url
                }
    except Exception as e:
        print(f"[-] Steam search failed: {e}")
    return default_meta

def scrape_and_patch_trainer(post, db: Client):
    """Scrapes specific trainer page, downloads binaries for ALL versions, extracts offsets, and inserts to Supabase."""
    print(f"[*] Processing: {post['title']} ({post['link']})")
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
    
    try:
        response = requests.get(post['link'], headers=headers, timeout=10)
        if response.status_code != 200:
            return
            
        soup = BeautifulSoup(response.text, 'html.parser')
        
        # Locate all download links (starts with /downloads/)
        download_anchors = soup.select('a[href*="/downloads/"]')
        if not download_anchors:
            print("[-] No download links found on page.")
            return
            
        # Deduplicate URLs preserving order
        seen_urls = set()
        unique_downloads = []
        for a in download_anchors:
            url = a['href']
            if url not in seen_urls:
                seen_urls.add(url)
                unique_downloads.append(a)
                
        # Check if game already exists in DB, otherwise insert new game
        game_res = db.table('games').select('id').eq('slug', post['slug']).execute()
        if game_res.data:
            game_id = game_res.data[0]['id']
        else:
            # Create new game meta row
            game_title_en = post['title'].split('Trainer')[0].strip()
            steam_meta = fetch_steam_meta(game_title_en)
            
            insert_game = db.table('games').insert({
                'title_en': game_title_en,
                'title_ko': steam_meta['title_ko'],
                'slug': post['slug'],
                'cover_image_url': steam_meta['cover_url'],
                'anti_cheat': 'none',
                'fling_url': post['link']
            }).execute()
            if not insert_game.data:
                print("[-] Failed to create game meta.")
                return
            game_id = insert_game.data[0]['id']
            
        # Now process each version download link
        for download_a in unique_downloads:
            download_url = download_a['href']
            download_text = download_a.text.strip()
            print(f"[*] Version download link found: {download_url} ({download_text})")
            
            try:
                # Download binary bytes
                dl_response = requests.get(download_url, headers=headers, timeout=30)
                if dl_response.status_code != 200:
                    print(f"[-] Failed to download binary from {download_url}")
                    continue
                    
                file_bytes = dl_response.content
                exe_bytes = None
                
                # Unzip if packaged
                if download_url.endswith('.zip') or file_bytes[:2] == b'PK':
                    print("[*] Unzipping package to extract executable...")
                    with zipfile.ZipFile(io.BytesIO(file_bytes)) as z:
                        for name in z.namelist():
                            if name.endswith('.exe'):
                                exe_bytes = z.read(name)
                                break
                else:
                    exe_bytes = file_bytes
                    
                if not exe_bytes or exe_bytes[:2] != b'MZ':
                    print("[-] Valid executable binary not found.")
                    continue
                    
                # Calculate file specs
                original_file_size = len(exe_bytes)
                original_file_hash = hashlib.sha256(exe_bytes).hexdigest()
                print(f"[+] Size: {original_file_size} bytes, Hash: {original_file_hash}")
                
                # Check if trainer version already exists in DB
                trainer_res = db.table('trainers').select('id').eq('original_file_hash', original_file_hash).execute()
                if trainer_res.data:
                    print(f"[*] Trainer version {original_file_hash} already exists in database. Skipping.")
                    continue
                    
                # Parse PE header for security boundaries
                text_section = parse_pe_binary(exe_bytes)
                if not text_section:
                    print("[-] Executable parsing failed. Section boundaries mismatch.")
                    continue
                    
                # Scan cheat options string offset
                mapping_details = scan_cheat_string_offset(exe_bytes)
                if not mapping_details:
                    print("[-] Option labels buffer not found inside binary.")
                    continue
                    
                # Prevent Shellcode write block: verify mapping falls outside .text segment
                text_start = text_section.PointerToRawData
                text_end = text_start + text_section.SizeOfRawData
                if text_start <= mapping_details['offset_dec'] < text_end:
                    print("[-] Security Warning: Mapping offset falls inside .text section. Operation blocked.")
                    continue
                    
                # Parse version and option count from download link text for accuracy
                v_match = re.search(r'v[0-9\.]+(?:-v[0-9\.]+)?', download_text)
                version_str = v_match.group(0) if v_match else "v1.0"
                
                opt_match = re.search(r'Plus\.(\d+)', download_text)
                option_count = int(opt_match.group(1)) if opt_match else 0
                
                final_version_str = f"{version_str} Plus {option_count}"
                
                # Insert Trainer specs
                insert_trainer = db.table('trainers').insert({
                    'game_id': game_id,
                    'version_str': final_version_str,
                    'option_count': option_count,
                    'original_file_hash': original_file_hash,
                    'original_file_size': original_file_size,
                    'is_packed': False
                }).execute()
                
                if not insert_trainer.data:
                    print("[-] Failed to insert trainer metadata.")
                    continue
                trainer_id = insert_trainer.data[0]['id']
                
                 # Run translation engine
                translated_text = process_translation_block(mapping_details['original_text'], db)
                
                # Write translation mappings to DB (instantly approved for automated site deployment)
                db.table('translation_mappings').insert({
                    'trainer_id': trainer_id,
                    'offset_dec': mapping_details['offset_dec'],
                    'encoding': mapping_details['encoding'],
                    'original_text': mapping_details['original_text'],
                    'translated_text': translated_text,
                    'max_char_len': mapping_details['max_char_len'],
                    'language_code': 'ko',
                    'is_approved': True  # Instantly live approved
                }).execute()
                
                print(f"[+] Successfully registered new trainer ID: {trainer_id} for Game ID: {game_id}!")
                
            except Exception as e:
                print(f"[-] Error processing download {download_url}: {e}")
                
    except Exception as e:
        print(f"[-] Error processing page: {e}")

def main():
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("[-] Supabase environment credentials not configured.")
        sys.exit(1)
        
    db: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
    print("[*] Scraper pipeline initialized. Monitoring FLiNG feed...")
    
    # Load dynamic dictionary from Supabase
    try:
        res = db.table('common_dictionary').select('english_term, korean_translation').execute()
        if res.data:
            for row in res.data:
                db_dictionary[row['english_term'].lower().strip()] = row['korean_translation']
            print(f"[+] Loaded {len(db_dictionary)} common translations from database.")
    except Exception as e:
        print(f"[*] Dynamic dictionary table not found, falling back to local dictionary. Error: {e}")
        
    posts = fetch_recent_trainers()
    if not posts:
        print("[-] No new updates found.")
        return
        
    # Process the most recent updates
    for post in posts[:3]:
        scrape_and_patch_trainer(post, db)

if __name__ == "__main__":
    main()
