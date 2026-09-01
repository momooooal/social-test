import { getJson } from './http';
import type { NormalizedContent, ProviderResult } from './types';

const version = process.env.META_API_VERSION || 'v25.0';
const graph = `https://graph.facebook.com/${version}`;

type PagePost = { id: string; message?: string; created_time: string; permalink_url?: string; shares?: { count?: number }; comments?: { summary?: { total_count?: number } }; reactions?: { summary?: { total_count?: number } } };
type Insight = { name: string; values?: Array<{ value: number | Record<string, number> }>; total_value?: { value: number | Record<string, number> } };

function metric(data: Insight[], names: string[]) {
  for (const name of names) {
    const item = data.find((row) => row.name === name);
    const value = item?.total_value?.value ?? item?.values?.at(-1)?.value;
    if (typeof value === 'number') return value;
    if (value && typeof value === 'object') return Object.values(value).reduce((sum, x) => sum + Number(x || 0), 0);
  }
  return 0;
}

async function postInsights(id: string, token: string) {
  try {
    const result = await getJson<{ data: Insight[] }>(`${graph}/${id}/insights`, { metric: 'post_impressions,post_impressions_unique,post_engaged_users,post_clicks' }, token);
    return { impressions: metric(result.data, ['post_impressions']), reach: metric(result.data, ['post_impressions_unique']), engagement: metric(result.data, ['post_engaged_users']), clicks: metric(result.data, ['post_clicks']) };
  } catch { return { impressions: 0, reach: 0, engagement: 0, clicks: 0 }; }
}

export async function syncFacebook(pageId: string, token: string): Promise<ProviderResult> {
  const warnings: string[] = [];
  let followers = 0;
  try {
    const page = await getJson<{ followers_count?: number; fan_count?: number }>(`${graph}/${pageId}`, { fields: 'followers_count,fan_count' }, token);
    followers = Number(page.followers_count ?? page.fan_count ?? 0);
  } catch { /* content sync may still work even when an account field is unavailable */ }
  const response = await getJson<{ data: PagePost[] }>(`${graph}/${pageId}/posts`, { fields: 'id,message,created_time,permalink_url,shares,comments.limit(0).summary(true),reactions.limit(0).summary(true)', limit: 100 }, token);
  const contents: NormalizedContent[] = [];
  for (const post of response.data) {
    const insights = await postInsights(post.id, token);
    const likes = Number(post.reactions?.summary?.total_count || 0);
    const comments = Number(post.comments?.summary?.total_count || 0);
    const shares = Number(post.shares?.count || 0);
    const fallbackEngagement = likes + comments + shares;
    contents.push({
      id: `facebook-${post.id}`, nativeContentId: post.id, platform: 'Facebook', type: 'Post', title: (post.message || 'Facebook 貼文').slice(0, 100), caption: post.message || '',
      publishedAt: post.created_time, views: insights.impressions, impressions: insights.impressions, reach: insights.reach, engagement: insights.engagement || fallbackEngagement,
      likes, comments, shares, saves: 0, clicks: insights.clicks, messages: 0, campaignId: 'unassigned', campaignName: '尚未歸類', confidence: 'low', reviewStatus: 'suggested',
      url: post.permalink_url || '', permalink: post.permalink_url || null, lastSource: 'facebook-api', lastUpdatedAt: new Date().toISOString(),
    });
  }
  if (!response.data.length) warnings.push('Facebook API 未回傳貼文。請檢查 Page token 與 pages_read_engagement 權限。');
  return { platform: 'Facebook', contents, account: { followers, reach: contents.reduce((sum, x) => sum + x.reach, 0), views: contents.reduce((sum, x) => sum + x.views, 0), engagement: contents.reduce((sum, x) => sum + x.engagement, 0) }, warnings };
}
