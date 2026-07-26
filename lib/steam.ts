export interface SteamNewsItem {
  gid: string;
  title: string;
  url: string;
  is_external_url: boolean;
  author: string;
  contents: string;
  feedlabel: string;
  date: number;
  feedname: string;
  feed_type: number;
  appid: number;
}

export interface SteamNewsResponse {
  appnews: {
    appid: number;
    newsitems: SteamNewsItem[];
  };
}

export async function getSteamNews(appId: number, count: number = 3): Promise<SteamNewsItem[]> {
  try {
    const res = await fetch(
      `https://api.steampowered.com/ISteamNews/GetNewsForApp/v0002/?appid=${appId}&count=${count}&maxlength=300&format=json`,
      {
        next: { revalidate: 3600 * 6 }, // Cache for 6 hours
      }
    );

    if (!res.ok) {
      console.error(`Failed to fetch Steam news for app ${appId}: ${res.statusText}`);
      return [];
    }

    const data = (await res.json()) as SteamNewsResponse;
    return data.appnews?.newsitems || [];
  } catch (error) {
    console.error(`Error fetching Steam news for app ${appId}:`, error);
    return [];
  }
}
