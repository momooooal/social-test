import { getAllPages, getJson, mapWithConcurrency } from './http';
import type { NormalizedContent, ProviderResult } from './types';

const version = process.env.META_API_VERSION || 'v25.0';
const graph = `https://graph.facebook.com/${version}`;

type PagePost = {
  id: string;
  message?: string;
  created_time: string;
  permalink_url?: string;
  shares?: { count?: number };
  comments?: { summary?: { total_count?: number } };
  reactions?: { summary?: { total_count?: number } };
};
type Insight = {
  name: string;
  values?: Array<{ value: number | Record<string, number> }>;
  total_value?: { value: number | Record<string, number> };
};

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
  let viewMetrics: Insight[] = [];
  let clickMetrics: Insight[] = [];
  let viewWarning = '';

  try {
    // Meta retired post_impressions/post_impressions_unique in 2025/2026.
    // These are the v25 Media Views replacements.
    const result = await getJson<{ data: Insight[] }>(`${graph}/${id}/insights`, {
      metric: 'post_media_view,post_total_media_view_unique',
    }, token);
    viewMetrics = result.data || [];
  } catch (error) {
    viewWarning = error instanceof Error ? error.message : 'Facebook Media Views unavailable';
  }

  try {
    const result = await getJson<{ data: Insight[] }>(`${graph}/${id}/insights`, { metric: 'post_clicks' }, token);
    clickMetrics = result.data || [];
  } catch {
    // Clicks are optional and may be unavailable for some Page/content types.
  }

  return {
    views: metric(viewMetrics, ['post_media_view']),
    reach: metric(viewMetrics, ['post_total_media_view_unique']),
    clicks: metric(clickMetrics, ['post_clicks']),
    viewsAvailable: viewMetrics.some((item) => item.name === 'post_media_view'),
    reachAvailable: viewMetrics.some((item) => item.name === 'post_total_media_view_unique'),
    viewWarning,
  };
}

export async function syncFacebook(pageId: string, token: string): Promise<ProviderResult> {
  const warnings = new Set<string>();
  let followers = 0;
  try {
    const page = await getJson<{ followers_count?: number; fan_count?: number }>(`${graph}/${pageId}`, { fields: 'followers_count,fan_count' }, token);
    followers = Number(page.followers_count ?? page.fan_count ?? 0);
  } catch {
    warnings.add('Facebook 粉絲數目前無法讀取，但貼文同步仍會繼續。');
  }

  const posts = await getAllPages<PagePost>(`${graph}/${pageId}/posts`, {
    fields: 'id,message,created_time,permalink_url,shares,comments.limit(0).summary(true),reactions.limit(0).summary(true)',
    limit: 100,
  }, token);

  const contents = await mapWithConcurrency(posts, 4, async (post): Promise<NormalizedContent> => {
    const insights = await postInsights(post.id, token);
    if (insights.viewWarning) warnings.add(`Facebook 部分貼文的 Media Views 無法取得：${insights.viewWarning}`);
    const likes = Number(post.reactions?.summary?.total_count || 0);
    const comments = Number(post.comments?.summary?.total_count || 0);
    const shares = Number(post.shares?.count || 0);
    const engagement = likes + comments + shares;
    return {
      id: `facebook-${post.id}`,
      nativeContentId: post.id,
      platform: 'Facebook',
      type: 'Post',
      title: (post.message || 'Facebook 貼文').slice(0, 100),
      caption: post.message || '',
      publishedAt: post.created_time,
      views: insights.views,
      impressions: insights.views,
      reach: insights.reach,
      engagement,
      likes,
      comments,
      shares,
      saves: 0,
      clicks: insights.clicks,
      messages: 0,
      campaignId: 'unassigned',
      campaignName: '尚未歸類',
      confidence: 'low',
      reviewStatus: 'suggested',
      url: post.permalink_url || '',
      permalink: post.permalink_url || null,
      metricAvailability: { views: insights.viewsAvailable, reach: insights.reachAvailable, impressions: false, engagement: true },
      sourceMetricNotes: [
        'Facebook Views 使用 post_media_view；舊 post_impressions 已停用。',
        'Facebook 人數型指標使用 post_total_media_view_unique（unique media viewers）。',
      ],
      lastSource: 'facebook-api',
      lastUpdatedAt: new Date().toISOString(),
    };
  });

  if (!posts.length) warnings.add('Facebook API 未回傳貼文。請檢查 Page token 與 pages_read_engagement 權限。');
  return {
    platform: 'Facebook',
    contents,
    account: {
      followers,
      reach: contents.reduce((sum, x) => sum + x.reach, 0),
      views: contents.reduce((sum, x) => sum + x.views, 0),
      engagement: contents.reduce((sum, x) => sum + x.engagement, 0),
    },
    warnings: [...warnings],
  };
}
