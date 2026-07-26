import os
import re
import json
from dotenv import load_dotenv
from supabase import create_client

load_dotenv('.env.local')

SUPABASE_URL = os.environ['NEXT_PUBLIC_SUPABASE_URL']
SUPABASE_KEY = os.environ['SUPABASE_SERVICE_ROLE_KEY']
db = create_client(SUPABASE_URL, SUPABASE_KEY)

# Remove POPULAR_SLUGS filter to process all games

def load_dictionary():
    res = db.table('common_dictionary').select('english_term, translated_de, translated_es').execute()
    de_dict = {}
    es_dict = {}
    for row in (res.data or []):
        en = row['english_term'].lower()
        if row.get('translated_de'):
            de_dict[en] = row['translated_de']
        if row.get('translated_es'):
            es_dict[en] = row['translated_es']
    return de_dict, es_dict

def is_valid_source_url(url: str) -> bool:
    return bool(url and url.startswith("https://flingtrainer.com/"))

def translate_block(text: str, trans_dict: dict) -> str:
    lines = text.split("\n")
    dict_results = []
    
    pattern = r"^([a-zA-Z0-9\+\s\.\-\*\/↑↓←→]+)\s*-\s*([^\*]+)(.*)$"
    
    for line in lines:
        if not line or line.strip() == "":
            dict_results.append(line)
            continue
            
        match = re.match(pattern, line.strip())
        if not match:
            dict_results.append(line)
            continue
            
        hotkey = match.group(1).strip()
        label = match.group(2).strip()
        notes = match.group(3).strip()
        label_lower = label.lower().replace("'", "").strip()
        
        translated_label = trans_dict.get(label_lower)
        if translated_label:
            # We don't have LLM fallback for DE/ES yet, so just leave notes in English if translated_label is found
            # or append them as is.
            dict_results.append(f"{hotkey} - {translated_label} {notes}".strip())
        else:
            # If no translation, leave as original
            dict_results.append(line)

    translated_lines = []
    for idx, line in enumerate(lines):
        if not line or line.strip() == "":
            translated_lines.append(line)
            continue
            
        orig_len = len(line)
        trans_line = dict_results[idx]

        # Space Padding to match byte length (since trainer patching requires exact length in bytes for memory overlay or we just pad chars)
        if len(trans_line) < orig_len:
            trans_line += " " * (orig_len - len(trans_line))
        elif len(trans_line) > orig_len:
            trans_line = trans_line[:orig_len]
            
        translated_lines.append(trans_line)
        
    return "\n".join(translated_lines)

def process_language(lang_code: str, trans_dict: dict, popular_games: list):
    print(f"\n[*] Processing language: {lang_code.upper()}")
    failures = 0
    
    for game in popular_games:
        game_id = game['id']
        game_slug = game['slug']
        source_url = game.get('fling_url')
        print(f"\n[*] {game['title_en']} ({game_slug})")
        
        trainer_res = db.table('trainers').select('id, version_str').eq('game_id', game_id).execute()
        trainers = trainer_res.data or []
        
        for trainer in trainers:
            trainer_id = trainer['id']
            version = trainer['version_str']
            
            # Check if mapping already exists
            check_res = db.table('translation_mappings').select('id').eq('trainer_id', trainer_id).eq('language_code', lang_code).execute()
            if check_res.data:
                print(f"  [-] Trainer ID {trainer_id} ({version}): {lang_code} already exists. Skipping.")
                continue

            if not is_valid_source_url(source_url):
                failures += 1
                print(f"[SOURCE_URL_MISSING] game={game_slug} trainer={trainer_id} No valid source URL.")
                continue
                
            # Get EN or KO mapping to extract original_text and offsets
            base_mapping_res = db.table('translation_mappings').select('*').eq('trainer_id', trainer_id).eq('language_code', 'ko').execute()
            if not base_mapping_res.data:
                base_mapping_res = db.table('translation_mappings').select('*').eq('trainer_id', trainer_id).eq('language_code', 'en').execute()
            
            if not base_mapping_res.data:
                print(f"  [-] Trainer ID {trainer_id} ({version}): No base mapping found to copy from.")
                continue
                
            base_mapping = base_mapping_res.data[0]
            original_text = base_mapping['original_text']
            offset_dec = base_mapping['offset_dec']
            encoding = base_mapping['encoding']
            max_char_len = base_mapping['max_char_len']
            
            translated_text = translate_block(original_text, trans_dict)
            
            try:
                db.table('translation_mappings').insert({
                    'trainer_id': trainer_id,
                    'offset_dec': offset_dec,
                    'encoding': encoding,
                    'original_text': original_text,
                    'translated_text': translated_text,
                    'max_char_len': max_char_len,
                    'language_code': lang_code,
                    'is_approved': False,
                    'translation_status': 'pending'
                }).execute()
                print(f"  [+] {lang_code.upper()} mapping inserted for {trainer_id}.")
            except Exception as e:
                failures += 1
                print(f"  [-] Failed to insert {lang_code} mapping: {e}")

    return failures

def main():
    de_dict, es_dict = load_dictionary()
    
    print("[*] Fetching all games...")
    game_res = db.table('games').select('id, slug, title_en, fling_url').execute()
    all_games = game_res.data or []
    
    fail_de = process_language('de', de_dict, all_games)
    fail_es = process_language('es', es_dict, all_games)
    
    print("\n[*] All translation mappings extension tasks completed.")
    if fail_de or fail_es:
        print(f"[*] Finished with {fail_de + fail_es} failures.")

if __name__ == "__main__":
    main()
