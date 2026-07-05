const { createClient } = require('@supabase/supabase-js');
const https = require('https');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const openAiKey = process.env.OPENAI_API_KEY;

if (!supabaseUrl || !supabaseAnonKey || !openAiKey) {
  console.error('[-] Required environment variables are missing!');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

function queryOpenAI(prompt) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      model: 'gpt-4.1-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1
    });

    const options = {
      hostname: 'api.openai.com',
      port: 443,
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + openAiKey
      }
    };

    const req = https.request(options, res => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          if (json.choices && json.choices[0]) {
            resolve(json.choices[0].message.content.trim());
          } else {
            reject(new Error('Invalid OpenAI response: ' + body));
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function hasKorean(text) {
  const reg = /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/;
  return reg.test(text);
}

async function startMigration() {
  try {
    console.log('[*] Fetching all games from database...');
    const { data: games, error } = await supabase.from('games').select('id, title_en, title_ko');
    if (error) throw error;

    console.log('[+] Fetched ' + games.length + ' games.');
    console.log('[*] Starting translation and database update in batches...');

    for (let i = 0; i < games.length; i++) {
      const game = games[i];
      const needsKoTranslation = !game.title_ko || !hasKorean(game.title_ko);

      const prompt = 'Translate the following PC/Steam game English title into its official/standard Korean and Japanese release titles. Return only a clean JSON object with keys ko and ja. Do not write markdown, backticks or extra text. Game Title: ' + game.title_en;

      try {
        const response = await queryOpenAI(prompt);
        const cleanJsonStr = response.replace(/`json/g, '').replace(/`/g, '').trim();
        const translated = JSON.parse(cleanJsonStr);

        const updatedFields = {
          title_ja: translated.ja || game.title_en
        };

        if (needsKoTranslation && translated.ko) {
          updatedFields.title_ko = translated.ko;
        }

        const { error: updateErr } = await supabase
          .from('games')
          .update(updatedFields)
          .eq('id', game.id);

        if (updateErr) throw updateErr;

        console.log('[' + (i+1) + '/' + games.length + '] Updated ID ' + game.id + ' (' + game.title_en + ') -> KO: ' + (updatedFields.title_ko || 'Skipped') + ', JA: ' + updatedFields.title_ja);

      } catch (err) {
        console.error('[-] Failed to translate game ID ' + game.id + ':', err.message);
      }

      await new Promise(r => setTimeout(r, 100));
    }

    console.log('[+] Migration completed successfully!');

  } catch (err) {
    console.error('[-] Migration process crashed:', err);
  }
}

startMigration();
