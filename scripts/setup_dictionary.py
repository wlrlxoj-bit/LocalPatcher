"""
common_dictionary 테이블에 COMMON_TRANSLATIONS 시드 데이터를 삽입하는 스크립트.
"""
import os, sys
sys.stdout.reconfigure(encoding='utf-8')

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env.local'))

from supabase import create_client

db = create_client(
    os.environ['NEXT_PUBLIC_SUPABASE_URL'],
    os.environ['NEXT_PUBLIC_SUPABASE_ANON_KEY']
)

# 테이블 존재 확인
try:
    test = db.table('common_dictionary').select('id').limit(1).execute()
    print("[OK] common_dictionary 테이블 확인 완료")
except Exception as e:
    print(f"[ERROR] 테이블 접근 실패: {e}")
    sys.exit(1)

SEED_DATA = {
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
    "check for updates": "업데이트 확인",
    # 범용 추가 용어
    "infinite mana": "무한 마나",
    "infinite mp": "무한 MP",
    "infinite ammo": "무한 탄약",
    "no skill cooldown": "스킬 쿨타임 제거",
    "infinite gold": "무한 골드",
    "edit gold": "골드 편집",
    "infinite skill points": "무한 스킬 포인트",
    "edit skill points": "스킬 포인트 편집",
    "infinite grenades": "무한 수류탄",
    "god mode": "갓 모드",
    "invincible": "무적",
    "no damage": "데미지 없음",
    "infinite oxygen": "무한 산소",
    "freeze timer": "타이머 고정",
    "unlimited resources": "무한 자원",
    "instant kill": "즉사 공격",
    "infinite lives": "무한 목숨",
    "infinite energy": "무한 에너지",
    "infinite shield": "무한 방어막",
    "unlock all": "전체 해금",
    "max level": "최대 레벨",
    "edit experience": "경험치 편집",
    "edit score": "점수 편집",
    "infinite arrows": "무한 화살",
    "infinite sp": "무한 SP",
    "edit crafting materials": "제작 재료 편집",
    "no weight limit": "무게 제한 없음",
    "infinite breath": "무한 호흡",
    "mega exp": "경험치 대량 획득",
    "one hit kills": "원샷원킬",
    "infinite consumables": "무한 소모품",
    "edit currency": "통화 편집",
}

# upsert 방식으로 삽입
inserted = 0
errors = 0
for eng, kor in SEED_DATA.items():
    try:
        db.table('common_dictionary').upsert(
            {'english_term': eng, 'korean_translation': kor},
            on_conflict='english_term'
        ).execute()
        inserted += 1
    except Exception as e:
        errors += 1
        print(f"  [SKIP] {eng}: {e}")

print(f"\n[DONE] 시드 삽입 완료: {inserted}개 성공, {errors}개 실패")

# 최종 확인
res = db.table('common_dictionary').select('id, english_term, korean_translation').order('id').execute()
print(f"common_dictionary 테이블 총 항목 수: {len(res.data)}\n")
for r in res.data:
    print(f"  {r['id']:>4} | {r['english_term']:<45} | {r['korean_translation']}")
