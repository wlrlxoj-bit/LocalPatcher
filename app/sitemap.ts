import { MetadataRoute } from 'next';
import { supabase, mockGames } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const BASE_URL = 'https://local-patcher.vercel.app';
  const locales = ['ko', 'en', 'ja'];
  
  // 1. Fetch games and trainers from database to find patchable games
  let patchableGameSlugs: string[] = [];
  
  if (supabase) {
    try {
      // Fetch games
      const { data: gamesData } = await supabase.from('games').select('id, slug');
      // Fetch trainers
      const { data: trainersData } = await supabase.from('trainers').select('game_id, option_count');
      
      if (gamesData && trainersData) {
        // Build set of game IDs that have at least one patchable trainer (option_count > 0)
        const patchableGameIds = new Set(
          trainersData
            .filter(t => t.option_count > 0)
            .map(t => t.game_id)
        );
        
        patchableGameSlugs = gamesData
          .filter(g => patchableGameIds.has(g.id))
          .map(g => g.slug);
      }
    } catch (err) {
      console.error('Sitemap DB query failed:', err);
    }
  }
  
  // Fallback to mock data if DB failed or is not configured
  if (patchableGameSlugs.length === 0) {
    patchableGameSlugs = mockGames.map(g => g.slug);
  }

  const sitemapEntries: MetadataRoute.Sitemap = [];

  // 2. Static pages for each locale
  const staticPaths = ['', '/terms', '/privacy', '/faq', '/support'];
  
  for (const locale of locales) {
    for (const path of staticPaths) {
      sitemapEntries.push({
        url: `${BASE_URL}/${locale}${path}`,
        lastModified: new Date(),
        changeFrequency: 'daily',
        priority: path === '' ? 1.0 : 0.5,
      });
    }
  }

  // 3. Dynamic game detail pages for each locale
  for (const locale of locales) {
    for (const slug of patchableGameSlugs) {
      sitemapEntries.push({
        url: `${BASE_URL}/${locale}/games/${slug}`,
        lastModified: new Date(),
        changeFrequency: 'weekly',
        priority: 0.8,
      });
    }
  }

  return sitemapEntries;
}
