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

// List of allowed abbreviations/words that do NOT indicate a translation leak
const allowedWords = new Set([
  'num', 'ctrl', 'alt', 'shift', 'pageup', 'pagedown', 'insert', 'delete', 'home', 'end',
  'hp', 'mp', 'sp', 'bp', 'xp', 'ap', 'jp', 'eac', 'id', 'ad', 'spa', 'fling', 'edit',
  'gta', 'cpu', 'gpu', 'ram', 'hud', 'fps', 'ok', 'vs', 'ii', 'iii', 'iv', 'v', 'vi'
]);

function hasEnglishLeak(text) {
  // Extract all English alphabetical words of length 3 or more
  const words = text.toLowerCase().match(/[a-z]{3,}/g) || [];
  
  // Check if any extracted word is NOT in the allowed set
  for (const word of words) {
    if (!allowedWords.has(word)) {
      return true; // English leak detected!
    }
  }
  return false;
}

async function run() {
  console.log('Detecting English text leaks in translations...');
  
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
  
  let koLeaks = [];
  let jaLeaks = [];
  
  allMappings.forEach(item => {
    const isKo = item.language_code === 'ko';
    const isJa = item.language_code === 'ja';
    
    if (isKo && hasEnglishLeak(item.translated_text)) {
      koLeaks.push(item);
    } else if (isJa && hasEnglishLeak(item.translated_text)) {
      jaLeaks.push(item);
    }
  });
  
  console.log(`\nLeak Analysis Results:`);
  console.log(`- Total Korean Mappings: ${allMappings.filter(m => m.language_code === 'ko').length}`);
  console.log(`- Korean Mappings with English Leaks: ${koLeaks.length} (${((koLeaks.length / allMappings.filter(m => m.language_code === 'ko').length)*100).toFixed(1)}%)`);
  
  console.log(`- Total Japanese Mappings: ${allMappings.filter(m => m.language_code === 'ja').length}`);
  console.log(`- Japanese Mappings with English Leaks: ${jaLeaks.length} (${((jaLeaks.length / allMappings.filter(m => m.language_code === 'ja').length)*100).toFixed(1)}%)`);
  
  if (koLeaks.length > 0) {
    console.log(`\n--- First 5 Korean Leaks Samples ---`);
    koLeaks.slice(0, 5).forEach(item => {
      console.log(`[Mapping ID: ${item.id}] [Trainer ID: ${item.trainer_id}]`);
      console.log(`Original: ${item.original_text.substring(0, 120)}...`);
      console.log(`Translated: ${item.translated_text.substring(0, 120)}...`);
      console.log('--------------------------------------------------');
    });
  }
}

run();
