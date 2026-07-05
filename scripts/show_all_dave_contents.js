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
  const { data, error } = await supabase
    .from('translation_mappings')
    .select('id, trainer_id, original_text, translated_text')
    .in('trainer_id', [2576, 2577, 2578, 2579, 2580])
    .order('id', { ascending: true });
  
  if (error) {
    console.error('Error:', error);
    return;
  }
  
  data.forEach(item => {
    console.log(`=========================================`);
    console.log(`[Mapping ID: ${item.id}] [Trainer ID: ${item.trainer_id}]`);
    console.log(`--- ORIGINAL ---`);
    console.log(item.original_text);
    console.log(`--- TRANSLATED ---`);
    console.log(item.translated_text);
  });
}

run();
