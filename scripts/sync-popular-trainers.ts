import { createClient } from '@supabase/supabase-js';

// Load environment variables

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function syncPopularGames() {
  console.log('Fetching top 30 games from FLiNG Popular API...');
  try {
    const response = await fetch('https://flingtrainer.com/wp-json/wordpress-popular-posts/v1/popular-posts?limit=30');
    const popularPosts = await response.json();
    
    console.log(`Fetched ${popularPosts.length} popular games from FLiNG.`);
    
    // Reset all is_popular to false first
    await supabase.from('games').update({ is_popular: false, popularity_index: 999 }).neq('id', 0);
    
    let matchedCount = 0;
    
    // Update our DB
    for (let i = 0; i < popularPosts.length; i++) {
      const post = popularPosts[i];
      const flingUrl = post.link;
      
      const { data: matchedGame } = await supabase
        .from('games')
        .select('id, title_en, fling_url')
        .eq('fling_url', flingUrl)
        .maybeSingle();
        
      if (matchedGame) {
        await supabase
          .from('games')
          .update({ is_popular: true, popularity_index: i + 1 })
          .eq('id', matchedGame.id);
        
        console.log(`[Matched Popular] ${matchedGame.title_en} (Rank: ${i + 1})`);
        matchedCount++;
      } else {
        // Fallback: match by title if URL is slightly different
        const cleanTitle = post.title.rendered.replace(' Trainer', '').trim();
        const { data: matchedByTitle } = await supabase
          .from('games')
          .select('id, title_en')
          .ilike('title_en', `%${cleanTitle}%`)
          .maybeSingle();
          
        if (matchedByTitle) {
          await supabase
            .from('games')
            .update({ is_popular: true, popularity_index: i + 1 })
            .eq('id', matchedByTitle.id);
          
          console.log(`[Matched by Title] ${matchedByTitle.title_en} (Rank: ${i + 1})`);
          matchedCount++;
        } else {
          console.log(`[Not Found in DB] ${post.title.rendered} (${flingUrl})`);
        }
      }
    }
    
    console.log(`Successfully synced ${matchedCount} popular games in DB.`);
    
  } catch (error) {
    console.error('Error syncing popular games:', error);
  }
}

async function backfillGenresAndTags() {
  console.log('Fetching games that need genres/tags...');
  
  // Find games where genres is empty array
  const { data: games, error } = await supabase
    .from('games')
    .select('id, steam_id, name, genres')
    .not('steam_id', 'is', null)
    .limit(50);
    
  if (error || !games) {
    console.error('Error fetching games:', error);
    return;
  }
  
  // Filter games that actually need backfill
  const needsBackfill = games.filter(g => !g.genres || g.genres.length === 0);
  
  console.log(`Found ${needsBackfill.length} games to process.`);
  
  for (const game of needsBackfill) {
    if (!game.steam_id) continue;
    
    console.log(`Processing: ${game.name} (${game.steam_id})`);
    
    try {
      const response = await fetch(`https://store.steampowered.com/api/appdetails?appids=${game.steam_id}&l=english`);
      const data = await response.json();
      
      if (data && data[game.steam_id] && data[game.steam_id].success) {
        const appData = data[game.steam_id].data;
        
        const genres = appData.genres ? appData.genres.map((g: any) => g.description) : [];
        const categories = appData.categories ? appData.categories.map((c: any) => c.description) : [];
        
        // Use categories as tags for now
        const tags = [...categories];
        
        await supabase
          .from('games')
          .update({ 
            genres: genres.length ? genres : ['Unknown'],
            tags: tags.length ? tags : ['Unknown']
          })
          .eq('id', game.id);
          
        console.log(`  -> Saved ${genres.length} genres and ${tags.length} tags`);
      } else {
        console.log(`  -> Failed to fetch data from Steam (might be age restricted or invalid)`);
        await supabase.from('games').update({ genres: ['Unknown'], tags: ['Unknown'] }).eq('id', game.id);
      }
      
      // Sleep to avoid rate limits
      await sleep(1500);
    } catch (e) {
      console.error(`  -> Error:`, e);
    }
  }
}

async function main() {
  console.log('Starting sync job...');
  await syncPopularGames();
  console.log('Done.');
}

main();
