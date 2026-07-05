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

async function run() {
  console.log('Analyzing database translation quality...');
  
  // Fetch a sample of mappings to see translation quality
  const { data, error } = await supabase
    .from('translation_mappings')
    .select('id, trainer_id, language_code, original_text, translated_text')
    .limit(100);
    
  if (error) {
    console.error('Error fetching mappings:', error);
    return;
  }
  
  let total = data.length;
  let uncommittedTranslations = 0; // matching exactly or containing mostly English when it should be Ko/Ja
  let englishOnlyLinesCount = 0;
  
  console.log(`Analyzed ${total} samples from translation_mappings table:`);
  
  data.forEach((item, index) => {
    const isKo = item.language_code === 'ko';
    const isJa = item.language_code === 'ja';
    
    // Simple check: if language is 'ko' but doesn't contain Korean characters (가-힣)
    const hasKorean = /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(item.translated_text);
    const hasJapanese = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff66-\uff9f]/.test(item.translated_text);
    
    let issue = false;
    if (isKo && !hasKorean) {
      issue = true;
    } else if (isJa && !hasJapanese) {
      issue = true;
    }
    
    if (issue) {
      uncommittedTranslations++;
      if (index < 10) { // Show first few issues
        console.log(`[Issue Sample #${index}] ID: ${item.id}, Lang: ${item.language_code}`);
        console.log(`Original: ${item.original_text.substring(0, 100)}...`);
        console.log(`Translated: ${item.translated_text.substring(0, 100)}...`);
        console.log('---------------------------------------------');
      }
    }
  });
  
  console.log(`Summary of 100 samples:`);
  console.log(`- Mappings with missing/poor translations: ${uncommittedTranslations}/${total} (${((uncommittedTranslations/total)*100).toFixed(1)}%)`);
}

run();
