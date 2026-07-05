const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

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

async function run() {
  const { data, error } = await supabase
    .from('translation_mappings')
    .select('id, trainer_id, original_text, translated_text')
    .in('trainer_id', [2576, 2577, 2578, 2579, 2580]);
  
  if (error) {
    console.error('Error fetching mappings:', error);
    return;
  }
  
  console.log(`Found ${data.length} mappings for Dave the Diver:`);
  data.forEach(item => {
    console.log(`- ID: ${item.id}, Trainer ID: ${item.trainer_id}`);
  });
}

run();
