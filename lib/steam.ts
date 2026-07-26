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

export function extractSteamAppId(coverUrl: string): number | null {
  if (!coverUrl) return null;
  const match = coverUrl.match(/\/apps\/(\d+)\//);
  return match ? parseInt(match[1], 10) : null;
}

export interface SteamAppDetails {
  pc_requirements?: {
    minimum?: string;
    recommended?: string;
  };
}

export async function getSteamAppDetails(appId: number): Promise<SteamAppDetails | null> {
  try {
    const res = await fetch(
      `https://store.steampowered.com/api/appdetails?appids=${appId}`,
      {
        next: { revalidate: 3600 * 24 }, // Cache for 24 hours
      }
    );

    if (!res.ok) {
      return null;
    }

    const data = await res.json();
    if (data[appId]?.success) {
      return data[appId].data as SteamAppDetails;
    }
    return null;
  } catch (error) {
    console.error(`Error fetching Steam app details for ${appId}:`, error);
    return null;
  }
}

export async function getSteamPlayerCount(appId: number): Promise<number | null> {
  try {
    const res = await fetch(
      `https://api.steampowered.com/ISteamUserStats/GetNumberOfCurrentPlayers/v1/?appid=${appId}`,
      {
        next: { revalidate: 900 }, // Cache for 15 minutes
      }
    );

    if (!res.ok) {
      return null;
    }

    const data = await res.json();
    if (data?.response?.result === 1) {
      return data.response.player_count as number;
    }
    return null;
  } catch (error) {
    console.error(`Error fetching Steam player count for ${appId}:`, error);
    return null;
  }
}
