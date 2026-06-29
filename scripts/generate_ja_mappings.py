"""
13개 인기 게임에 대해 기존 한국어(ko) 번역 매핑 데이터를 바탕으로 
일어(ja) 번역 매핑 데이터를 생성하고 Supabase DB에 적재하는 스크립트.
"""
import os
import sys
import re
import json
import requests
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

POPULAR_SLUGS = [
    'elden-ring',
    'cyberpunk-2077-trainer',
    'palworld-trainer',
    'grand-theft-auto-v-trainer-1766066855',
    'red-dead-redemption-2-trainer',
    'monster-hunter-wilds-trainer',
    'hogwarts-legacy-trainers',
    'octopath-traveler-ii-trainer',
    'octopath-traveler',
    'hades-ii-trainer',
    'hades-trainer',
    'the-witcher-3-wild-hunt-trainer',
    'stellaris',
]

def load_ja_dictionary():
    print("[*] common_dictionary에서 일어 사전 데이터를 로드하는 중...")
    ja_dict = {}
    try:
        res = db.table('common_dictionary').select('english_term, translated_ja').execute()
        if res.data:
            for row in res.data:
                eng = row.get('english_term')
                ja = row.get('translated_ja')
                if eng and ja:
                    ja_dict[eng.lower().strip()] = ja.strip()
        print(f"[+] 일어 사전 데이터 {len(ja_dict)}개 로드 완료.")
    except Exception as e:
        print(f"[-] 사전 로드 실패: {e}")
    return ja_dict

def translate_via_llm_ja(lines_to_translate):
    """OpenAI API를 사용하여 번역 대상 라인들을 일어로 번역합니다."""
    if not lines_to_translate:
        return {}

    prompt = (
        "You are a professional game localization expert.\n"
        "Translate the following list of game trainer cheat options into natural, standard Japanese used by Japanese gamers.\n\n"
        "CRITICAL RULES:\n"
        "1. KEEP the exact hotkey prefix (e.g. 'Num 1 -', 'Ctrl+Num 1 -', 'Alt+Num 1 -') unchanged.\n"
        "2. Translate only the description label and any note texts (e.g. Translate 'Infinite HP' to '体力無限' or '無限体力').\n"
        "3. Return your output strictly as a JSON object with a single key 'translations' containing an array of translated Japanese strings in the EXACT same order.\n"
    )

    try:
        response = client.chat.completions.create(
            model="gpt-4.1-mini",
            messages=[
                {"role": "system", "content": prompt},
                {"role": "user", "content": json.dumps(lines_to_translate, ensure_ascii=False)}
            ],
            response_format={"type": "json_object"},
            temperature=0.1
        )
        
        result = json.loads(response.choices[0].message.content)
        translated_array = result.get("translations", [])
        if len(translated_array) == len(lines_to_translate):
            return dict(zip(lines_to_translate, translated_array))
    except Exception as e:
        print(f"[-] LLM 일어 번역 실패: {e}")
    
    return {}

def translate_block_to_ja(text: str, ja_dict: dict) -> str:
    """텍스트 블록 전체를 일어로 번역하고 바이트 크기를 패딩하여 맞춥니다."""
    lines = text.split("\n")
    dict_results = []
    lines_needing_llm = []

    pattern = r"^([a-zA-Z0-9\+\s\.\-\*\/↑↓←→]+)\s*-\s*([^\*]+)(.*)$"

    # 1차 패스: 사전 매핑 적용
    for line in lines:
        if not line or line.strip() == "":
            dict_results.append(line)
            continue
            
        match = re.match(pattern, line.strip())
        if not match:
            dict_results.append(line) # 헤더나 메모는 그대로 유지
            continue
            
        hotkey = match.group(1).strip()
        label = match.group(2).strip()
        notes = match.group(3).strip()
        label_lower = label.lower().replace("'", "").strip()
        
        translated_label = ja_dict.get(label_lower)
        if translated_label:
            # 메모 번역 매핑
            translated_notes = ""
            if notes:
                notes_lower = notes.lower()
                if "takes effect" in notes_lower:
                    translated_notes = " **効果適用時に反映"
                elif "activate before" in notes_lower:
                    translated_notes = " **使用前に有効化"
                else:
                    translated_notes = notes
            
            # 일어로 번역된 라인 생성
            # 일본어 표기는 통상 "Num 1 - 無限体力" 형태
            dict_results.append(f"{hotkey} - {translated_label}{translated_notes}")
        else:
            dict_results.append(None)
            lines_needing_llm.append(line)

    # 2차 패스: LLM 번역
    llm_map = {}
    if lines_needing_llm:
        llm_map = translate_via_llm_ja(lines_needing_llm)

    # 3차 패스: 길이 싱크 및 조립
    translated_lines = []
    for idx, line in enumerate(lines):
        if not line or line.strip() == "":
            translated_lines.append(line)
            continue
            
        orig_len = len(line)
        trans_line = dict_results[idx]
        if trans_line is None:
            trans_line = llm_map.get(line, line)

        # Space Padding을 적용하여 byte/char 길이 맞추기
        if len(trans_line) < orig_len:
            trans_line += " " * (orig_len - len(trans_line))
        elif len(trans_line) > orig_len:
            trans_line = trans_line[:orig_len]
            
        translated_lines.append(trans_line)
        
    return "\n".join(translated_lines)

def main():
    ja_dict = load_ja_dictionary()
    
    print("[*] 13개 인기 게임 목록을 조회하는 중...")
    # popular slugs 게임 id 가져오기
    game_res = db.table('games').select('id, slug, title_en').in_('slug', POPULAR_SLUGS).execute()
    popular_games = game_res.data or []
    
    print(f"[+] 조회된 인기 게임 수: {len(popular_games)}개")
    
    for game in popular_games:
        game_id = game['id']
        game_slug = game['slug']
        print(f"\n[*] 게임 처리 중: {game['title_en']} ({game_slug})")
        
        # 해당 게임의 트레이너들 조회
        trainer_res = db.table('trainers').select('id, version_str').eq('game_id', game_id).execute()
        trainers = trainer_res.data or []
        print(f"  [+] 조회된 트레이너 수: {len(trainers)}개")
        
        for trainer in trainers:
            trainer_id = trainer['id']
            version = trainer['version_str']
            
            # 이미 ja 번역이 등록되어 있는지 확인
            ja_check = db.table('translation_mappings').select('id').eq('trainer_id', trainer_id).eq('language_code', 'ja').execute()
            if ja_check.data:
                print(f"  [-] 트레이너 ID {trainer_id} ({version}): 이미 일본어 번역이 존재합니다. 스킵.")
                continue
                
            # 기존 한국어(ko) 번역 또는 원본을 활용하기 위해 기존 매핑 정보 조회
            ko_mapping_res = db.table('translation_mappings').select('*').eq('trainer_id', trainer_id).eq('language_code', 'ko').execute()
            if not ko_mapping_res.data:
                print(f"  [-] 트레이너 ID {trainer_id} ({version}): 한국어 매핑 데이터가 없어 번역 생성을 스킵합니다.")
                continue
                
            ko_mapping = ko_mapping_res.data[0]
            original_text = ko_mapping['original_text']
            offset_dec = ko_mapping['offset_dec']
            encoding = ko_mapping['encoding']
            max_char_len = ko_mapping['max_char_len']
            
            print(f"  [*] 트레이너 ID {trainer_id} ({version}) 번역 진행 중...")
            
            # 일어 번역 적용
            translated_ja = translate_block_to_ja(original_text, ja_dict)
            
            # DB 삽입
            try:
                db.table('translation_mappings').insert({
                    'trainer_id': trainer_id,
                    'offset_dec': offset_dec,
                    'encoding': encoding,
                    'original_text': original_text,
                    'translated_text': translated_ja,
                    'max_char_len': max_char_len,
                    'language_code': 'ja',
                    'is_approved': True
                }).execute()
                print(f"  [+] 일본어 매핑 등록 완료.")
            except Exception as e:
                print(f"  [-] 일본어 매핑 등록 중 에러 발생: {e}")

    print("\n[*] 모든 일본어 번역 확장 작업이 완료되었습니다.")

if __name__ == "__main__":
    main()
