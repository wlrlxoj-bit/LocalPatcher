const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const https = require('https');

// Manually parse .env.local
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
const openAiKey = env.OPENAI_API_KEY;

const allowedWords = new Set([
  'num', 'ctrl', 'alt', 'shift', 'pageup', 'pagedown', 'insert', 'delete', 'home', 'end',
  'hp', 'mp', 'sp', 'bp', 'xp', 'ap', 'jp', 'eac', 'id', 'ad', 'spa', 'fling', 'edit',
  'gta', 'cpu', 'gpu', 'ram', 'hud', 'fps', 'ok', 'vs', 'ii', 'iii', 'iv', 'v', 'vi'
]);

function hasEnglishLeak(text) {
  const words = text.toLowerCase().match(/[a-z]{3,}/g) || [];
  for (const word of words) {
    if (!allowedWords.has(word)) {
      return true;
    }
  }
  return false;
}

// Helper to call OpenAI API using raw https (to avoid installing external axios/openai packages)
function askOpenAI(prompt, systemPrompt) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      model: 'gpt-4.1-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt }
      ],
      temperature: 0.1
    });

    const options = {
      hostname: 'api.openai.com',
      port: 443,
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openAiKey}`,
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            reject(new Error(parsed.error.message));
          } else {
            resolve(parsed.choices[0].message.content.trim());
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', (e) => reject(e));
    req.write(postData);
    req.end();
  });
}

async function translateText(originalText, targetLang) {
  const langName = targetLang === 'ko' ? 'Korean' : 'Japanese';
  const systemPrompt = `You are a professional game localizer. Translate the given game trainer hotkeys and cheats description into extremely natural and gaming-friendly ${langName}.
Rules:
1. Maintain the hotkey prefixes (e.g. Num 1, Ctrl+Num 2, Alt+Num 3, Shift) and placeholders.
2. Fully translate all English descriptions, warnings, or sub-options (e.g. "**Takes effect when...", "Sushi Bar Options") into ${langName}.
3. Keep the line breaks (\\n) and overall format exactly identical to the original text.
4. Output ONLY the translated result, with no explanations, no chat, and no code blocks.`;

  try {
    return await askOpenAI(originalText, systemPrompt);
  } catch (err) {
    console.error('OpenAI translate failed:', err.message);
    return null;
  }
}

async function run() {
  if (!openAiKey) {
    console.error('No OpenAI API Key found in .env.local');
    return;
  }

  console.log('Fetching mappings with English leaks from DB...');
  
  let allMappings = [];
  let from = 0;
  let to = 999;
  let hasMore = true;
  
  while (hasMore) {
    const { data, error } = await supabase
      .from('translation_mappings')
      .select('id, trainer_id, language_code, original_text, translated_text')
      .range(from, to);
      
    if (error) {
      console.error('Error fetching range:', error);
      break;
    }
    
    if (data.length === 0) {
      hasMore = false;
    } else {
      allMappings = allMappings.concat(data);
      from += 1000;
      to += 1000;
    }
  }
  
  const leaks = allMappings.filter(item => hasEnglishLeak(item.translated_text));
  console.log(`Found ${leaks.length} leak items to translate.`);
  
  // To prevent API rate limits, we process in chunks
  const chunkSize = 5; // Safe concurrency
  for (let i = 0; i < leaks.length; i += chunkSize) {
    const chunk = leaks.slice(i, i + chunkSize);
    console.log(`Processing batch ${Math.floor(i / chunkSize) + 1}/${Math.ceil(leaks.length / chunkSize)}...`);
    
    await Promise.all(chunk.map(async (item) => {
      console.log(`  Translating Mapping ID: ${item.id} (Lang: ${item.language_code})`);
      const translated = await translateText(item.original_text, item.language_code);
      
      if (translated) {
        // Update database
        const { error } = await supabase
          .from('translation_mappings')
          .update({ translated_text: translated })
          .eq('id', item.id);
          
        if (error) {
          console.error(`  Failed to update Mapping ID ${item.id} in DB:`, error.message);
        } else {
          console.log(`  🟢 Successfully updated Mapping ID ${item.id}`);
        }
      }
    }));
    
    // Tiny delay between chunks to avoid rate limit
    await new Promise(r => setTimeout(r, 1000));
  }
  
  console.log('All translation leak repairs completed!');
}

run();
