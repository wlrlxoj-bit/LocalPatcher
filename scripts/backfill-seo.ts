import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function fetchSteamDescriptions(titleEn: string, appid: string) {
  const languages = {
    'en': 'english',
    'ko': 'koreana',
    'ja': 'japanese',
    'de': 'german',
    'es': 'spanish'
  };

  const result: any = {
    descriptions: {} as Record<string, string>,
    genres: [] as string[],
    tags: [] as string[],
  };

  let fetchedGenresAndTags = false;

  for (const [langCode, steamLang] of Object.entries(languages)) {
    try {
      const detailsUrl = `https://store.steampowered.com/api/appdetails?appids=${appid}&l=${steamLang}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const res = await fetch(detailsUrl, { signal: controller.signal });
      clearTimeout(timeoutId);
      
      if (res.ok) {
        const data = await res.json() as any;
        if (data[appid]?.success) {
          const gameData = data[appid].data;
          result.descriptions[`description_${langCode}`] = gameData.short_description || '';
          
          if (!fetchedGenresAndTags && langCode === 'en') {
            if (gameData.genres) {
              result.genres = gameData.genres.map((g: any) => g.description);
            }
            if (gameData.categories) {
              result.tags = gameData.categories.map((c: any) => c.description);
            }
            fetchedGenresAndTags = true;
          }
        }
      }
      // Wait 1.5 seconds between language requests to avoid Steam rate limits
      await new Promise(r => setTimeout(r, 1500));
    } catch (e) {
      console.error(`Failed to fetch ${steamLang} for ${titleEn}:`, e);
    }
  }

  return result;
}

async function main() {
  console.log('[*] Fetching games without descriptions...');
  
  // We'll process games that don't have description_en or genres yet
  const { data: games, error } = await supabase
    .from('games')
    .select('id, title_en, cover_image_url, description_en, genres')
    .order('id', { ascending: false });

  if (error || !games) {
    console.error('Failed to fetch games:', error);
    return;
  }

  const gamesToProcess = games.filter(g => !g.description_en || !g.genres || g.genres.length === 0);
  console.log(`[*] Found ${gamesToProcess.length} games to backfill out of ${games.length} total.`);

  for (let i = 0; i < gamesToProcess.length; i++) {
    const game = gamesToProcess[i];
    console.log(`[${i+1}/${gamesToProcess.length}] Processing ${game.title_en}...`);
    
    // Extract appid from cover_image_url
    // e.g. https://cdn.cloudflare.steamstatic.com/steam/apps/1091500/header.jpg
    const match = game.cover_image_url.match(/\/apps\/(\d+)\//);
    if (!match) {
      console.log(`  [-] No valid Steam AppID found in cover URL for ${game.title_en}. Skipping.`);
      continue;
    }
    
    const appid = match[1];
    
    const result = await fetchSteamDescriptions(game.title_en, appid);
    
    if (Object.keys(result.descriptions).length > 0 || result.genres.length > 0 || result.tags.length > 0) {
      const updateData = {
        ...result.descriptions,
        ...(result.genres.length > 0 ? { genres: result.genres } : {}),
        ...(result.tags.length > 0 ? { tags: result.tags } : {}),
      };

      const { error: updateError } = await supabase
        .from('games')
        .update(updateData)
        .eq('id', game.id);
        
      if (updateError) {
        console.error(`  [-] Failed to update DB for ${game.title_en}:`, updateError);
      } else {
        console.log(`  [+] Successfully updated SEO info for ${game.title_en}`);
      }
    } else {
      console.log(`  [-] No descriptions/genres found for ${game.title_en}`);
    }
    
    // Additional delay between games
    await new Promise(r => setTimeout(r, 1000));
  }
  
  console.log('[*] Backfill complete.');
}

main().catch(console.error);
