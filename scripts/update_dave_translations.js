const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    let value = match[2] ? match[2].trim() : '';
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
    env[match[1]] = value;
  }
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const transGroup1 = `Num 1 - 갓 모드/피격 무시
Num 2 - 무한 산소
Num 3 - 무한 탄약 **탄약 감소 시 효과가 적용됩니다.
Num 4 - 무한 장비 사용 **장비 사용량이 감소하지 않습니다.
Num 5 - 무한 장비 배터리 **장비 배터리가 감소하지 않습니다.
Num 6 - 무게 용량 편집 **무게 수치 변경 시 효과가 적용됩니다.
Num 7 - 수영 속도 설정
Num 8 - 게임 속도 조절
Num 9 - 물고기: 최소 수영 속도
Num 0 - 초강력 피해/한 방 즉사
Num . - 데미지 배율 설정
Num + - 무한 드론
Num - - 베이(Bei) 편집 **베이 수치 변경 시 효과가 적용됩니다.

초밥집 옵션

Ctrl+Num 1 - 무한 스태미나
Ctrl+Num 2 - 즉시 요리
Ctrl+Num 3 - 무한 와사비 **와사비 수량 감소 시 효과가 적용됩니다.
Ctrl+Num 4 - 이동 속도 설정
Ctrl+Num 5 - 보유 돈 편집 **돈 수치 변경 시 효과가 적용됩니다.
Ctrl+Num 6 - 장인 불꽃(장인 쿡플레임) 편집 **장인 불꽃 변경 시 효과가 적용됩니다.
Ctrl+Num 7 - 재료 수량 수정 **재료 메뉴를 열 때 효과가 적용됩니다.
`;

const transGroup2 = `Num 1 - 갓 모드/피격 무시
Num 2 - 무한 산소
Num 3 - 무한 탄약 **탄약 감소 시 효과가 적용됩니다.
Num 4 - 무한 장비 사용 **장비 사용량이 감소하지 않습니다.
Num 5 - 무한 장비 배터리 **장비 배터리가 감소하지 않습니다.
Num 6 - 무게 용량 편집 **무게 수치 변경 시 효과가 적용됩니다.
Num 7 - 수영 속도 설정
Num 8 - 게임 속도 조절
Num 9 - 물고기: 최소 수영 속도
Num 0 - 초강력 피해/한 방 즉사
Num . - 데미지 배율 설정

초밥집 옵션

Ctrl+Num 1 - 무한 스태미나
Ctrl+Num 2 - 즉시 요리
Ctrl+Num 3 - 무한 와사비 **와사비 수량 감소 시 효과가 적용됩니다.
Ctrl+Num 4 - 이동 속도 설정
Ctrl+Num 5 - 보유 돈 편집 **돈 수치 변경 시 효과가 적용됩니다.
Ctrl+Num 6 - 쿡 플레임(장인 불꽃) 편집 **쿡 플레임 수치 변경 시 효과가 적용됩니다.
Ctrl+Num 7 - 재료 수량 수정 **재료 메뉴를 열 때 효과가 적용됩니다.
`;

async function run() {
  console.log('Updating Dave the Diver translation mappings in database...');
  
  // Update 2549 ~ 2552 (Trainer 2576 ~ 2579)
  const { data: data1, error: error1 } = await supabase
    .from('translation_mappings')
    .update({ translated_text: transGroup1 })
    .in('id', [2549, 2550, 2551, 2552]);
    
  if (error1) {
    console.error('Error updating group 1:', error1);
  } else {
    console.log('Successfully updated Mapping IDs 2549, 2550, 2551, 2552');
  }

  // Update 2553 (Trainer 2580)
  const { data: data2, error: error2 } = await supabase
    .from('translation_mappings')
    .update({ translated_text: transGroup2 })
    .eq('id', 2553);
    
  if (error2) {
    console.error('Error updating group 2:', error2);
  } else {
    console.log('Successfully updated Mapping ID 2553');
  }
}

run();
