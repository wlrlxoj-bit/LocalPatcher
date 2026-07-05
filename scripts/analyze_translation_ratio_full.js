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
  console.log('Running full translation quality audit...');
  
  // Fetch all translation mappings
  // Note: We use range pagination to prevent memory limits
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
  
  let totalKo = 0;
  let totalJa = 0;
  let invalidKo = 0;
  let invalidJa = 0;
  
  const sampleIssues = [];
  
  allMappings.forEach(item => {
    const isKo = item.language_code === 'ko';
    const isJa = item.language_code === 'ja';
    
    const hasKorean = /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(item.translated_text);
    // Japanese check covers Hiragana, Katakana, and common Kanji
    const hasJapanese = /[\u3040-\u30ff\u31f0-\u31ff\u4e00-\u9faf]/.test(item.translated_text);
    
    if (isKo) {
      totalKo++;
      if (!hasKorean) {
        invalidKo++;
        if (sampleIssues.length < 5) {
          sampleIssues.push({ lang: 'ko', original: item.original_text, translated: item.translated_text, id: item.id });
        }
      }
    } else if (isJa) {
      totalJa++;
      if (!hasJapanese) {
        invalidJa++;
        if (sampleIssues.length < 5) {
          sampleIssues.push({ lang: 'ja', original: item.original_text, translated: item.translated_text, id: item.id });
        }
      }
    }
  });
  
  console.log(`\nAudit Results:`);
  console.log(`- Total Mappings: ${allMappings.length}`);
  console.log(`- Korean Mappings: ${totalKo} (Poor/English-only: ${invalidKo}, ${((invalidKo/totalKo)*100).toFixed(1)}%)`);
  console.log(`- Japanese Mappings: ${totalJa} (Poor/English-only: ${invalidJa}, ${((invalidJa/totalJa)*100).toFixed(1)}%)`);
  
  if (sampleIssues.length > 0) {
    console.log(`\n--- Sample of Poor Translations ---`);
    sampleIssues.forEach(issue => {
      console.log(`[ID: ${issue.id}] [Lang: ${issue.lang}]`);
      console.log(`Original:\n${issue.original.substring(0, 150)}...`);
      console.log(`Translated:\n${issue.translated.substring(0, 150)}...`);
      console.log('--------------------------------------------------');
    });
  }
}

run();
