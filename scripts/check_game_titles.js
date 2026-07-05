const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('[-] Supabase environment variables are missing!');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

function hasKorean(text) {
  const reg = /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/;
  return reg.test(text);
}

async function checkGames() {
  try {
    console.log('[*] Fetching all games from database...');
    const { data: games, error } = await supabase.from('games').select('id, title_en, title_ko');
    if (error) throw error;

    console.log('[+] Total games in DB: ' + games.length);
    
    let mismatchedCount = 0;
    const mismatches = [];

    for (const game of games) {
      if (!game.title_ko || !hasKorean(game.title_ko)) {
        mismatchedCount++;
        if (mismatches.length < 15) {
          mismatches.push(game);
        }
      }
    }

    console.log('[!] Games with missing Korean translation (English only in title_ko): ' + mismatchedCount);
    console.log('[*] Sample mismatched games:');
    console.log(JSON.stringify(mismatches, null, 2));

  } catch (err) {
    console.error('[-] Error checking games:', err);
  }
}

checkGames();
