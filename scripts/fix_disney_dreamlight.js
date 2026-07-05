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
  console.log('Fixing Disney Dreamlight Valley game meta data (ID: 680)...');
  
  const { data, error } = await supabase
    .from('games')
    .update({
      title_en: 'Disney Dreamlight Valley',
      title_ko: '디즈니 드림라이트 밸리',
      slug: 'disney-dreamlight-valley',
      cover_image_url: 'https://cdn.cloudflare.steamstatic.com/steam/apps/1471710/header.jpg'
    })
    .eq('id', 680)
    .select();
    
  if (error) {
    console.error('Failed to fix game meta:', error.message);
  } else {
    console.log('🟢 Successfully fixed Disney Dreamlight Valley!', data);
  }
}

run();
