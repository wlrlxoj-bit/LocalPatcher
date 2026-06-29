import { createClient } from '@supabase/supabase-js';

// Get environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Check if Supabase env credentials are set to actual project keys
const isSupabaseConfigured = 
  supabaseUrl && 
  supabaseAnonKey && 
  !supabaseUrl.includes('your-supabase-project') && 
  !supabaseAnonKey.includes('your-supabase-anon-key');

// Initialize the real Supabase client (only if configured)
export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

export interface Game {
  id: number;
  title_en: string;
  title_ko: string;
  slug: string;
  cover_image_url: string;
  anti_cheat: string;
  fling_url?: string;
}

// Mock database data
export const mockGames: Game[] = [
  {
    id: 1,
    title_en: 'Octopath Traveler',
    title_ko: '옥토패스 트래블러',
    slug: 'octopath-traveler',
    cover_image_url: 'https://cdn.cloudflare.steamstatic.com/steam/apps/921570/header.jpg',
    anti_cheat: 'none',
    fling_url: 'https://flingtrainer.com/trainer/octopath-traveler-trainer/'
  },
  {
    id: 2,
    title_en: 'Octopath Traveler II',
    title_ko: '옥토패스 트래블러 2',
    slug: 'octopath-traveler-2',
    cover_image_url: 'https://cdn.cloudflare.steamstatic.com/steam/apps/1971650/header.jpg',
    anti_cheat: 'none',
    fling_url: 'https://flingtrainer.com/trainer/octopath-traveler-ii-trainer/'
  },
  {
    id: 3,
    title_en: 'Cyberpunk 2077',
    title_ko: '사이버펑크 2077',
    slug: 'cyberpunk-2077',
    cover_image_url: 'https://cdn.cloudflare.steamstatic.com/steam/apps/1091500/header.jpg',
    anti_cheat: 'none',
    fling_url: 'https://flingtrainer.com/trainer/cyberpunk-2077-trainer/'
  },
  {
    id: 4,
    title_en: 'Elden Ring',
    title_ko: '엘든 링',
    slug: 'elden-ring',
    cover_image_url: 'https://cdn.cloudflare.steamstatic.com/steam/apps/1245620/header.jpg',
    anti_cheat: 'EAC',
    fling_url: 'https://flingtrainer.com/trainer/elden-ring-trainer/'
  }
];


export const mockTrainers = [
  {
    id: 10,
    game_id: 1,
    version_str: 'v1.0-v20210325 Plus 8',
    option_count: 8,
    original_file_hash: '0b895d43e6ab462fa51b9a24c05345d81234567890abcdef1234567890abcdef',
    original_file_size: 1459200,
    is_packed: false
  },
  {
    id: 12,
    game_id: 2,
    version_str: 'v1.0-v1.1.0 Plus 17',
    option_count: 17,
    original_file_hash: '8f4806a6cc2290740a023740a023848123456789abcdefabcdefabcdefabcdef',
    original_file_size: 1514496,
    is_packed: false
  },
  {
    id: 13,
    game_id: 3,
    version_str: 'v2.0-v2.1 Plus 46',
    option_count: 46,
    original_file_hash: 'e5d2151bd565352cf2e1a2c37f4cbc1024c493effc97a74562beee531a930148',
    original_file_size: 1789440,
    is_packed: false
  },
  {
    id: 14,
    game_id: 4,
    version_str: 'v1.02-v1.10 Plus 35',
    option_count: 35,
    original_file_hash: 'd819e8f3a8a8853b79a1364a7b87694c155973df85e6d2e102c8bc1affcd82d1',
    original_file_size: 1466880,
    is_packed: false
  },
  {
    id: 15,
    game_id: 3,
    version_str: 'v1.03-v1.06 Plus 32',
    option_count: 32,
    original_file_hash: '1fc65525fcb8f5b2c840eb73c9a9203cbfd22401d5e9312a61945186344adb0d',
    original_file_size: 1445376,
    is_packed: false
  },
  {
    id: 16,
    game_id: 3,
    version_str: 'v1.12-v1.61 Plus 36',
    option_count: 36,
    original_file_hash: 'a3c25b87123def456abcdef123456789abcdef123456789abcdef1234567890',
    original_file_size: 1582200,
    is_packed: false
  }
];

export const mockMappings: Record<number, Array<{
  offset_dec: number;
  encoding: 'UTF-16LE' | 'ASCII' | 'UTF-8';
  original_text: string;
  translated_text: string;
  language_code: string;
  max_char_len: number;
}>> = {
  // OT1
  10: [
    {
      offset_dec: 552912,
      encoding: 'UTF-16LE',
      original_text: 'Num 1 - Infinite HP\nNum 2 - Infinite SP\nNum 3 - Infinite BP\nNum 4 - Infinite Leaves\nNum 5 - Infinite JP\nNum 6 - Game Speed Adjust\nNum 7 - One Hit Kill\nNum 8 - 100% Capture/Drop Rate',
      translated_text: 'Num 1 - 무한 HP\nNum 2 - 무한 SP\nNum 3 - 무한 BP\nNum 4 - 무한 리프\nNum 5 - 무한 JP\nNum 6 - 게임 속도 조절\nNum 7 - 적 한방에 처치\nNum 8 - 100% 포획/드롭율',
      language_code: 'ko',
      max_char_len: 240
    },
    {
      offset_dec: 547616,
      encoding: 'UTF-16LE',
      original_text: 'Hotkey Guide:\n- Press hotkeys on numeric keypad.',
      translated_text: '단축키 안내: 우측 숫자 패드의 숫자 키를 사용하십시오.',
      language_code: 'ko',
      max_char_len: 183
    },
    {
      offset_dec: 542312,
      encoding: 'UTF-16LE',
      original_text: 'Game detected, trainer active!',
      translated_text: '게임 감지, 트레이너 활성화!',
      language_code: 'ko',
      max_char_len: 30
    },
    {
      offset_dec: 542384,
      encoding: 'UTF-16LE',
      original_text: 'Game not detected, waiting...',
      translated_text: '게임 미감지, 트레이너 대기 중.',
      language_code: 'ko',
      max_char_len: 35
    },
    {
      offset_dec: 542464,
      encoding: 'UTF-16LE',
      original_text: 'Game running, trainer active!',
      translated_text: '게임 실행 중, 트레이너 활성화!',
      language_code: 'ko',
      max_char_len: 38
    },
    {
      offset_dec: 546096,
      encoding: 'UTF-16LE',
      original_text: 'Warning: Admin rights needed.',
      translated_text: '트레이너 작동을 위해 관리자 권한 실행을 권장합니다.',
      language_code: 'ko',
      max_char_len: 160
    },
    {
      offset_dec: 547984,
      encoding: 'UTF-16LE',
      original_text: 'Set waypoint in map first.',
      translated_text: '웨이포인트 기능을 사용하기 위해 맵에서 핀을 먼저 지정하십시오.',
      language_code: 'ko',
      max_char_len: 77
    },
    {
      offset_dec: 547560,
      encoding: 'UTF-16LE',
      original_text: 'Check for Updates',
      translated_text: '트레이너 업데이트 확인',
      language_code: 'ko',
      max_char_len: 24
    }
  ],
  // OT2
  12: [
    {
      offset_dec: 814752,
      encoding: 'UTF-16LE',
      original_text: 'Num 1 - Infinite HP\nNum 2 - Infinite SP\nNum 3 - Infinite BP\nNum 4 - Infinite Latent Power\nNum 5 - Infinite Shield\nNum 6 - Max Defense\nNum 7 - Infinite Items\nNum 8 - Set Game Speed\nNum 9 - 100% Steal/Drop Rate\nNum 0 - One Hit Kill\n\nCtrl+Num 1 - Edit Gold\nCtrl+Num 2 - Gold Multiplier\nCtrl+Num 3 - Infinite EXP\nCtrl+Num 4 - EXP Multiplier\nCtrl+Num 5 - Infinite JP\nCtrl+Num 6 - JP Multiplier\nCtrl+Num 7 - Set Game Speed',
      translated_text: "Num 1 - 무한 HP\nNum 2 - 무한 SP\nNum 3 - 무한 BP\nNum 4 - 무한 저력\nNum 5 - 실드 무한\nNum 6 - 최대 방어력\nNum 7 - 아이템 비소모\nNum 8 - 게임 속도 설정\nNum 9 - 100% 훔치기/드롭율\nNum 0 - 적 한방에 처치\n\nCtrl+Num 1 - 골드 편집\nCtrl+Num 2 - 골드 획득 배율\nCtrl+Num 3 - 무한 경험치\nCtrl+Num 4 - 경험치 획득 배율\nCtrl+Num 5 - 무한 JP\nCtrl+Num 6 - JP 획득 배율\nCtrl+Num 7 - 게임 속도 설정",
      language_code: 'ko',
      max_char_len: 882
    },
    {
      offset_dec: 806272,
      encoding: 'UTF-16LE',
      original_text: 'Hotkey Guide:\n- Press hotkeys on keypad.',
      translated_text: '단축키 안내:\n- 단축키는 숫자 키패드(Num)를 사용합니다.\n- 일반 키보드의 숫자가 아닌 우측 키패드를 입력해 주세요.\n- 노트북의 경우 Fn 키와 조합하여 활성화할 수 있습니다.',
      language_code: 'ko',
      max_char_len: 183
    },
    {
      offset_dec: 800840,
      encoding: 'UTF-16LE',
      original_text: 'Game detected, trainer active!',
      translated_text: '게임 감지, 트레이너 활성화!',
      language_code: 'ko',
      max_char_len: 30
    },
    {
      offset_dec: 800912,
      encoding: 'UTF-16LE',
      original_text: 'Game not detected, waiting...',
      translated_text: '게임 미감지, 트레이너 대기 중.',
      language_code: 'ko',
      max_char_len: 35
    },
    {
      offset_dec: 800992,
      encoding: 'UTF-16LE',
      original_text: 'Game running, trainer active!',
      translated_text: '게임 실행 중, 트레이너 활성화!',
      language_code: 'ko',
      max_char_len: 38
    },
    {
      offset_dec: 804720,
      encoding: 'UTF-16LE',
      original_text: 'Warning: Admin rights needed.',
      translated_text: "경고: 트레이너를 원활하게 가동하기 위해서는 반드시 '관리자 권한'으로 실행해 주셔야 메모리 후킹 차단을 예방할 수 있습니다.",
      language_code: 'ko',
      max_char_len: 160
    },
    {
      offset_dec: 806640,
      encoding: 'UTF-16LE',
      original_text: 'Set waypoint in map first.',
      translated_text: '웨이포인트 설정: 지도(M)를 열고 위치를 클릭한 뒤 이동 단축키를 눌러주세요.',
      language_code: 'ko',
      max_char_len: 77
    },
    {
      offset_dec: 806216,
      encoding: 'UTF-16LE',
      original_text: 'Check for Updates',
      translated_text: '트레이너 업데이트 확인',
      language_code: 'ko',
      max_char_len: 24
    }
  ],
  // Cyberpunk 2077
  13: [
    {
      offset_dec: 697572,
      encoding: 'UTF-16LE',
      original_text: "Num 1 - Infinite Health\nNum 2 - Infinite Stamina\nNum 3 - Infinite Items/Ammo **Takes effect when item/ammo quantity decreases.\\n\\nOnly works for item quantity greater than 1 and less than 9999.\\n\\nFor items greater than 9999, use \"Items Won't Decrease\" option if needed.\nNum 4 - Items Won't Decrease\nNum 5 - Healing Items No Cooldown **Activate before using healing items.\nNum 6 - Grenades No Cooldown **Activate before using grenades.\nNum * - Projectile Launch System No Cooldown **Activate before using projectile launcher system.\nNum 7 - No Reload\nNum 8 - Super Accuracy\nNum 9 - No Recoil\nNum 0 - One Hit Kill **Note this option also affect vehicles, if you're in a vehicle, you should disable this option.\\n\\nDisable this option when you're in a fist fight, otherwise you may not be able to win the fight.\nNum . - Damage Multiplier **The display damage value is not affected, but the actual damage is multiplied.\\n\\nNote this option also affect vehicles, if you're in a vehicle, you should disable this option.\\n\\nDisable this option when you're in a fist fight, otherwise you may not be able to win the fight.\nNum + - Defense Multiplier\nNum - - Stealth Mode **Enemies will not see you, but if you attack them, you will be detected.\n\nCtrl+Num 1 - Edit Money\nCtrl+Num 2 - Infinite XP **Takes effect when you gain XP.\nCtrl+Num 3 - XP Multiplier **Note the display XP gain value is not affected, but the actual amount of XP you are getting is multiplied.\nCtrl+Num 4 - Infinite Street Cred **Takes effect when you gain street cred.\nCtrl+Num 5 - Street Cred Multiplier **Note the display street cred gain value is not affected, but the actual amount of street cred you are getting is multiplied.\nCtrl+Num 6 - Max Skill XP/Progression **Takes effect when you gain skill progression.\nCtrl+Num 7 - Skill XP Multiplier **Note the display skill progression gain value is not affected, but the actual amount of skill progression you are getting is multiplied.\nCtrl+Num 8 - Edit Attribute Points\nCtrl+Num 9 - Edit Perk Points\nCtrl+Num 0 - Edit Relic Points\nCtrl+Num . - Ignore Cyberware Capacity **Takes effect when you change cyberware in ripperdoc shop. If it says you don't have enough capacity, try unequip some cyberware and re-equip them to unlock the capacity limit.\\n\\nWhen activated, the cyberware capacity bar may be hidden, or the used capacity may be displayed as 440, this is normal.\\n\\nTo disable this option after it took effect, you may need to save and reload the game in order to cancel its effect.\nCtrl+Num + - Set Game Speed\n\nAlt+Num 1 - Infinite RAM\nAlt+Num 2 - Freeze Breach Protocol Timer\nAlt+Num 3 - Infinite Components **Only works for components you already have in your inventory.\nAlt+Num 4 - Infinite Quickhack Components **Only works for quickhack components you already have in your inventory.\nAlt+Num 5 - Edit Max Carrying Weight **If you're overburdened before using this option, you'll need to pick up or drop something to remove the overburdened debuff.\nAlt+Num 6 - Set Movement Speed **The game may limit your movement speed when the multiplier is too high (somewhere between 2.0 and 5.0).\nAlt+Num 7 - Super Jump\nAlt+Num 8 - Infinite Double Jumps (Reinforced Tendons) **Requires equipping reinforced tendons (legs cyberware, purchasable in ripperdoc shop).\nAlt+Num 9 - Edit Player Level **After editing level, you'll need to level up once in order to update stats and effects related to player level.\nAlt+Num 0 - Edit Street Cred Level **After editing street cred level, you'll need to level up street cred once in order to update stats and effects related to street cred level.\nAlt+Num . - Freeze Daytime\nAlt+Num + - Daytime +1 Hour\n\nShift+F1 - Edit Headhunter Skill Level **Activate before opening the character menu. After editing skill level, you'll need to level up this skill once in order to update stats and effects of this skill.\nShift+F2 - Edit Netrunner Skill Level **Activate before opening the character menu. After editing skill level, you'll need to level up this skill once in order to update stats and effects of this skill.\nShift+F3 - Edit Shinobi Skill Level **Activate before opening the character menu. After editing skill level, you'll need to level up this skill once in order to update stats and effects of this skill.\nShift+F4 - Edit Solo Skill Level **Activate before opening the character menu. After editing skill level, you'll need to level up this skill once in order to update stats and effects of this skill.\nShift+F5 - Edit Engineer Skill Level **Activate before opening the character menu. After editing skill level, you'll need to level up this skill once in order to update stats and effects of this skill.\n\nShift+PageUp - Enable Fly Mode **When activated, you can use the flying hotkeys to fly freely (noclip). You can also walk normally in air.\\n\\nFlying hotkeys:\\nShift + ↑: Fly North\\nShift + ↓:  Fly South\\nShift + ←:  Fly West\\nShift + →:  Fly East\nShift+Num + - Set Fly Height\nShift+Num - - Set Fly Speed **Note, this option only affects flying speed when using flying hotkeys, does not affect normal walking speed in air.\n",
      translated_text: "Num 1 - 무한 체력          \nNum 2 - 무한 스태미나         \nNum 3 - 무한 아이템/탄약 **아이템 또는 탄약 감소 시 수량이 고정됩니다.\n\n수량이 2개 이상 9998개 이하인 아이템에만 적용됩니다.\n\n9999개 이상의 아이템은 \"아이템 감소 방지\" 옵션을 사용하세요.                                                                                                   \nNum 4 - 아이템 감소 방지           \nNum 5 - 회복 아이템 쿨타임 제거 **회복 아이템을 사용하기 전에 활성화하세요.                         \nNum 6 - 수류탄 쿨타임 제거 **수류탄을 투척하기 전에 활성화하세요.                     \nNum * - 투사체 발사 시스템 쿨타임 제거 **투사체 발사 시스템을 사용하기 전에 활성화하세요.                                         \nNum 7 - 재장전 없음   \nNum 8 - 초정밀 사격        \nNum 9 - 반동 없음    \nNum 0 - 원샷원킬 **이 옵션은 탈것에도 적용되므로, 차량에 탑승할 때는 비활성화하는 것을 권장합니다.\n\n격투 미션(주먹다짐) 중에는 이 옵션을 꺼두셔야 정상 진행이 가능합니다.                                                                                                                 \nNum . - 데미지 배율 설정 **표시되는 데미지 수치에는 변화가 없으나 실제 데미지가 배율만큼 적용됩니다.\n\n이 옵션은 탈것에도 적용되므로, 차량에 탑승할 때는 비활성화하는 것을 권장합니다.\n\n격투 미션(주먹다짐) 중에는 이 옵션을 꺼두셔야 정상 진행이 가능합니다.                                                                                                                                                      \nNum + - 방어력 배율 설정         \nNum - - 은신 모드 **적이 플레이어를 인식하지 못하지만, 먼저 공격하면 발각됩니다.                                            \n\nCtrl+Num 1 - 보유 돈 편집   \nCtrl+Num 2 - 무한 경험치 (XP) **경험치를 획득할 때 효과가 적용됩니다.         \nCtrl+Num 3 - 경험치 획득 배율 **표시되는 경험치는 그대로지만 실제 경험치 상승치가 배율만큼 증가합니다.                                                                       \nCtrl+Num 4 - 무한 길거리 평판 **평판(스트리트 크레드)을 획득할 때 적용됩니다.                        \nCtrl+Num 5 - 길거리 평판 배율 **표시되는 평판 상승치는 그대로지만 실제 평판 상승치가 배율만큼 증가합니다.                                                                                                \nCtrl+Num 6 - 스킬 레벨 최대화 (진행도) **스킬 진행도를 획득할 때 효과가 적용됩니다.                              \nCtrl+Num 7 - 스킬 경험치 배율 **표시되는 스킬 경험치는 그대로지만 실제 스킬 상승치가 배율만큼 증가합니다.                                                                                                         \nCtrl+Num 8 - 특성 포인트 편집            \nCtrl+Num 9 - 특전 포인트 편집       \nCtrl+Num 0 - 릴릭 포인트 편집        \nCtrl+Num . - 사이버웨어 용량 제한 무시 **리퍼닥 상점에서 사이버웨어를 변경할 때 적용됩니다. 용량이 부족하다는 경고가 뜨면 일부 사이버웨어를 장착 해제했다가 재장착해 보세요.\n\n활성화 시 사이버웨어 용량 표시줄이 숨겨지거나 사용 용량이 440으로 고정되어 표시될 수 있으며, 이는 정상입니다.\n\n효과 적용 후 이 옵션을 끄려면 게임을 저장하고 다시 불러와야(Save & Load) 완전히 취소될 수 있습니다.                                                                                                                                                                                                                            \nCtrl+Num + - 게임 속도 조절      \n\nAlt+Num 1 - 무한 RAM      \nAlt+Num 2 - 침투 프로토콜 타이머 고정              \nAlt+Num 3 - 무한 제작 부품 **인벤토리에 이미 보유하고 있는 제작 부품에만 적용됩니다.                                         \nAlt+Num 4 - 무한 퀵핵 부품 **인벤토리에 이미 보유하고 있는 퀵핵 제작 부품에만 적용됩니다.                                                          \nAlt+Num 5 - 최대 휴대 용량 편집 **이미 과적 상태인 경우, 물건을 줍거나 버려서 과적 디버프를 갱신해야 정상으로 돌아옵니다.                                                                                       \nAlt+Num 6 - 이동 속도 설정 **배율이 너무 높으면(대략 2.0에서 5.0 사이) 게임 시스템에 의해 속도가 제한될 수 있습니다.                                                           \nAlt+Num 7 - 슈퍼 점프     \nAlt+Num 8 - 무한 이단 점프 (강화 힘줄) **다리 사이버웨어인 강화 힘줄(리퍼닥 상점 구매 가능)을 반드시 장착해야 합니다.                                                                    \nAlt+Num 9 - 플레이어 레벨 편집 **레벨을 편집한 후, 능력치와 효과를 올바르게 동기화하려면 경험치를 얻어 레벨을 최소 1회 올려야 합니다.                                                            \nAlt+Num 0 - 길거리 평판 레벨 편집 **스트리트 크레드 레벨을 편집한 후 레벨이 정상적으로 반영되려면 평판을 최소 1회 올려야 합니다.                                                                                                 \nAlt+Num . - 시간 흐름 고정      \nAlt+Num + - 시간 1시간 전진      \n\nShift+F1 - 헤드헌터 스킬 레벨 편집 **캐릭터 메뉴를 열기 전에 활성화하세요. 레벨 편집 후 스킬 효과를 올바르게 동기화하려면 스킬을 최소 1회 획득해야 합니다.                                                                                                            \nShift+F2 - 넷러너 스킬 레벨 편집 **캐릭터 메뉴를 열기 전에 활성화하세요. 레벨 편집 후 스킬 효과를 올바르게 동기화하려면 스킬을 최소 1회 획득해야 합니다.                                                                                                            \nShift+F3 - 시노비 스킬 레벨 편집 **캐릭터 메뉴를 열기 전에 활성화하세요. 레벨 편집 후 스킬 효과를 올바르게 동기화하려면 스킬을 최소 1회 획득해야 합니다.                                                                                                          \nShift+F4 - 솔로 스킬 레벨 편집 **캐릭터 메뉴를 열기 전에 활성화하세요. 레벨 편집 후 스킬 효과를 올바르게 동기화하려면 스킬을 최소 1회 획득해야 합니다.                                                                                                        \nShift+F5 - 테크니션 스킬 레벨 편집 **캐릭터 메뉴를 열기 전에 활성화하세요. 레벨 편집 후 스킬 효과를 올바르게 동기화하려면 스킬을 최소 1회 획득해야 합니다.                                                                                                          \n\nShift+PageUp - 비행 모드 활성화 **비행 단축키를 이용해 공중을 날아다닐 수 있습니다. 공중을 그냥 걷는 것도 가능합니다.\n\n비행 단축키:\nShift + ↑: 북쪽으로 비행\nShift + ↓:  남쪽으로 비행\nShift + ←:  서쪽으로 비행\nShift + →:  동쪽으로 비행                                                                             \nShift+Num + - 비행 높이 설정      \nShift+Num - - 비행 속도 설정 **비행 단축키 사용 시 속도에만 영향을 주며, 공중에서의 일반 도보 걷기 속도에는 영향이 없습니다.                                                                  \n",
      language_code: 'ko',
      max_char_len: 5093
    }
  ],
  // Elden Ring
  14: [
    {
      offset_dec: 811348,
      encoding: 'UTF-16LE',
      original_text: "Num 1 - God Mode/Ignore Hits\nNum 2 - Infinite HP\nNum 3 - Infinite FP\nNum 4 - Infinite Stamina\nNum 5 - Zero Weight\nNum 6 - Infinite Item Usage **Takes effect when you use items, their amounts will be reset to max.\nNum 7 - 100% Drop Rate\nNum 8 - Stealth Mode **When activated, enemies will ignore you, but you will be detected if you attack them.\nNum 9 - Immune To All Negative Status\nNum 0 - Super Damage/One Hit Kill\nNum . - Damage Multiplier\nNum + - Defense Multiplier\nNum / - Infinite Horse HP **Note, the horse may still run away/disappear if it gets hit multiple times. To prevent that, you can use \"God Mode/Ignore Hits\" option, which also works for the horse.\n\nCtrl+Num 1 - Edit Runes\nCtrl+Num 2 - Runes Multiplier\nCtrl+Num 3 - Won't Lose Runes When Player Dies\nCtrl+Num 4 - Freeze Daytime\nCtrl+Num 5 - Daytime +1 Hour\nCtrl+Num 6 - Set Game Speed\nCtrl+Num 7 - Enable Fly Mode **When activated, it will lock player's Y position, use \"Fly Up\" or \"Fly Down\" to go up and down, then move freely with regular control (keyboard/controller).\\n\\nIf you want to disable this option, make sure you're near the ground, otherwise you may die from fall damage (God Mode and Infinite HP won't work for fall damage).\\n\\nAlso try not to jump in fly mode, you may die from fall damage if you stuck in the jumping animation for too long.\nCtrl+Num 8 - Fly Up\nCtrl+Num 9 - Fly Down\nCtrl+Num 0 - Freeze Enemies Position\n\nEdit Player Stats\n\nAlt+Num 1 - Edit Level\nAlt+Num 2 - Edit Vigor\nAlt+Num 3 - Edit Mind\nAlt+Num 4 - Edit Endurance\nAlt+Num 5 - Edit Strength\nAlt+Num 6 - Edit Dexterity\nAlt+Num 7 - Edit Intelligence\nAlt+Num 8 - Edit Faith\nAlt+Num 9 - Edit Arcane\nAlt+Num 0 - Edit Max HP\nAlt+Num . - Edit Max FP\nAlt+Num + - Edit Max Stamina\n\n",
      translated_text: "Num 1 - 갓 모드/피격 무시          \nNum 2 - 무한 HP      \nNum 3 - 무한 FP      \nNum 4 - 무한 스태미나         \nNum 5 - 무게 제로      \nNum 6 - 무한 아이템 사용 **수량이 최대치로 리셋됩니다.                                                               \nNum 7 - 드롭율 100%      \nNum 8 - 은신 모드 **공격 시에만 적이 감지합니다.                                                                            \nNum 9 - 모든 디버프 면역                    \nNum 0 - 슈퍼 데미지/원샷원킬              \nNum . - 데미지 배율 설정        \nNum + - 방어력 배율 설정         \nNum / - 무한 탈것 HP **피격 시 도망치거나 사라질 수 있습니다. 이를 막으려면 갓 모드 옵션을 함께 사용하세요.                                                                                                                               \n\nCtrl+Num 1 - 룬 편집      \nCtrl+Num 2 - 룬 획득 배율         \nCtrl+Num 3 - 사망 시 룬 분실 방지                     \nCtrl+Num 4 - 시간 고정         \nCtrl+Num 5 - 시간 1시간 전진      \nCtrl+Num 6 - 게임 속도 조절      \nCtrl+Num 7 - 비행 모드 활성화 **Y좌표 고정 (낙사 주의)                                                                                                                                                                                                                                                                                                                                                                                                                                                 \nCtrl+Num 8 - 비행 상승 \nCtrl+Num 9 - 비행 하강   \nCtrl+Num 0 - 적 위치 고정                \n\n스탯 에디터           \n\nAlt+Num 1 - 레벨 에디트    \nAlt+Num 2 - 생명력 에디트   \nAlt+Num 3 - 정신력 에디트  \nAlt+Num 4 - 지구력 에디트       \nAlt+Num 5 - 근력 에디트       \nAlt+Num 6 - 기량 에디트        \nAlt+Num 7 - 지력 에디트           \nAlt+Num 8 - 신앙 에디트    \nAlt+Num 9 - 신비 에디트     \nAlt+Num 0 - 최대 HP 에디트  \nAlt+Num . - 최대 FP 에디트  \nAlt+Num + - 최대 스태미나 에디트     \n\n",
      language_code: 'ko',
      max_char_len: 1728
    }
  ],
  15: [
    {
      offset_dec: 564912,
      encoding: 'UTF-16LE',
      original_text: "\n\nNum 1 - Infinite Health\nNum 2 - Infinite Stamina\nNum 3 - Infinite Items/Ammo\nNum 4 - Items Won't Decrease\nNum 5 - Infinite Grenades\nNum 6 - No Reload\nNum 7 - Super Accuracy\nNum 8 - No Recoil\nNum 9 - Edit Money\nNum 0 - One Hit Kill\nNum . - Damage Multiplier\nNum + - Stealth Mode\n\nCtrl+Num 1 - Infinite XP\nCtrl+Num 2 - XP Multiplier\nCtrl+Num 3 - Infinite Street Cred\nCtrl+Num 4 - Street Cred \u00d7\nCtrl+Num 5 - Max Skill XP/Progression\nCtrl+Num 6 - Skill XP Multiplier\nCtrl+Num 7 - Edit Attribute Points\nCtrl+Num 8 - Edit Perk Points\nCtrl+Num 9 - Set Game Speed\nAlt+Num 1 - Infinite RAM\nAlt+Num 2 - Freeze Breach Protocol Timer\nAlt+Num 3 - Infinite Components\nAlt+Num 4 - Infinite Quickhack Components\nAlt+Num 5 - Edit Max Carrying Weight\nAlt+Num 6 - Movement Speed\nAlt+Num 7 - Super Jump\nAlt+Num 8 - Inf. Double Jump (Req. Reinforced Tendons)\nAlt+Num 9 - Edit Player Level\nAlt+Num 0 - Edit Street Cred Level\nAlt+Num . - Skills Instant Cooldown\n\n",
      translated_text: "\n\nNum 1 - 무한 체력          \nNum 2 - 무한 스태미나         \nNum 3 - 무한 아이템/탄약          \nNum 4 - 아이템 감소 방지           \nNum 5 - 무한 수류탄           \nNum 6 - 재장전 없음   \nNum 7 - 초정밀 사격        \nNum 8 - 반동 없음    \nNum 9 - 보유 돈 편집   \nNum 0 - 원샷원킬        \nNum . - 데미지 배율 설정        \nNum + - 은신 모드       \n\nCtrl+Num 1 - 무한 경험치     \nCtrl+Num 2 - 경험치 배율       \nCtrl+Num 3 - 무한 길거리 평판           \nCtrl+Num 4 - 길거리 평판 배율    \nCtrl+Num 5 - 스킬 레벨 최대화               \nCtrl+Num 6 - 스킬 경험치 배율          \nCtrl+Num 7 - 특성 포인트 편집            \nCtrl+Num 8 - 특전 포인트 편집       \nCtrl+Num 9 - 게임 속도 조절      \nAlt+Num 1 - 무한 RAM      \nAlt+Num 2 - 침투 타이머 고정                   \nAlt+Num 3 - 제작 부품 무한           \nAlt+Num 4 - 퀵핵 제작부품 무한                   \nAlt+Num 5 - 최대 휴대 용량 편집             \nAlt+Num 6 - 이동 속도 설정      \nAlt+Num 7 - 슈퍼 점프     \nAlt+Num 8 - 무한 이단 점프 (강화 힘줄 필요)                       \nAlt+Num 9 - 플레이어 레벨 편집       \nAlt+Num 0 - 길거리 평판 레벨 편집          \nAlt+Num . - 스킬 즉시 재사용              \n\n",
      language_code: 'ko',
      max_char_len: 944
    }
  ],
  16: [
    {
      offset_dec: 598200,
      encoding: 'UTF-16LE',
      original_text: 'Num 1 - ...',
      translated_text: 'Num 1 - ...',
      language_code: 'ko',
      max_char_len: 1200
    }
  ]

};

// Helper query function that fallback to mock data
export async function getGames() {
  if (!supabase) return mockGames;
  try {
    const { data, error } = await supabase.from('games').select('*');
    if (error || !data) throw error || new Error('No data');
    return data;
  } catch (err) {
    console.warn('Supabase query failed, falling back to mock data:', err);
    return mockGames;
  }
}

export async function getGamesWithTrainers() {
  if (!supabase) {
    return mockGames.map(game => ({
      ...game,
      trainers: mockTrainers.filter(t => t.game_id === game.id)
    }));
  }
  try {
    const { data, error } = await supabase
      .from('games')
      .select('*, trainers(id, version_str, option_count)');
    if (error || !data) throw error || new Error('No data');
    return data;
  } catch (err) {
    console.warn('getGamesWithTrainers failed, falling back:', err);
    return mockGames.map(game => ({
      ...game,
      trainers: mockTrainers.filter(t => t.game_id === game.id)
    }));
  }
}

export async function getGameBySlug(slug: string) {
  if (!supabase) return mockGames.find(g => g.slug === slug) || null;
  try {
    const { data, error } = await supabase.from('games').select('*').eq('slug', slug).maybeSingle();
    if (error) throw error;
    return data;
  } catch (err) {
    console.warn('Supabase query failed, falling back to mock data:', err);
    return mockGames.find(g => g.slug === slug) || null;
  }
}

export async function getTrainersForGame(gameId: number) {
  if (!supabase) return mockTrainers.filter(t => t.game_id === gameId);
  try {
    const { data, error } = await supabase.from('trainers').select('*').eq('game_id', gameId);
    if (error || !data) throw error || new Error('No data');
    return data;
  } catch (err) {
    console.warn('Supabase query failed, falling back to mock data:', err);
    return mockTrainers.filter(t => t.game_id === gameId);
  }
}

export async function getMappingsForTrainer(trainerId: number, lang: string = 'ko') {
  if (!supabase) {
    const mappings = mockMappings[trainerId] || [];
    return mappings.filter(m => m.language_code === lang);
  }
  try {
    const { data, error } = await supabase
      .from('translation_mappings')
      .select('*')
      .eq('trainer_id', trainerId)
      .eq('language_code', lang)
      .eq('is_approved', true);
    if (error || !data) throw error || new Error('No data');
    return data;
  } catch (err) {
    console.warn('Supabase query failed, falling back to mock data:', err);
    const mappings = mockMappings[trainerId] || [];
    return mappings.filter(m => m.language_code === lang);
  }
}
