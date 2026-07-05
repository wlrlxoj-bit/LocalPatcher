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
  console.log('Searching for game with slug or id: 1779375894...');
  
  // 1. Search by slug
  const { data: bySlug, error: err1 } = await supabase
    .from('games')
    .select('*')
    .eq('slug', '1779375894');
    
  if (err1) console.error('Slug query error:', err1);
  else console.log('Query by Slug Result:', bySlug);
  
  // 2. Search by id
  const { data: byId, error: err2 } = await supabase
    .from('games')
    .select('*')
    .eq('id', 1779375894);
    
  if (err2) console.error('ID query error:', err2);
  else console.log('Query by ID Result:', byId);
  
  // 3. Search by steam_appid or anything containing it
  const { data: byAppId, error: err3 } = await supabase
    .from('games')
    .select('*')
    .eq('steam_appid', '1779375894');
    
  if (err3) console.log('No steam_appid column or error:', err3.message);
  else console.log('Query by steam_appid Result:', byAppId);
}

run();
