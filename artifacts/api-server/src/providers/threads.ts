import { getAllPages, getJson, mapWithConcurrency } from './http';
import type { NormalizedContent, ProviderResult } from './types';

const graph = 'https://graph.threads.net';
type ThreadPost = { id: string; text?: string; timestamp: string; permalink?: string; media_type?: string };
type Insight = { name: string; values?: Array<{ value: number }>; total_value?: { value: number } };

function value(data: Insight[], name: string) {
  const item = data.find((x) => x.name === name);
  const metricValue = item?.total_value?.value ?? item?.values?.at(-1)?.value;
  return typeof metricValue === 'number' ? metricValue : 0;
}

async function postInsights(id: string, token: string) {
  let core: Insight[] = [];
  let shares: Insight[] = [];
  let partial = false;
  try {
    const result = await getJson<{ data: Insight[] }>(`${graph}/${id}/insights`, {
      metric: 'views,likes,replies,reposts,quotes',
    }, token);
    core = result.data || [];
  } catch {
    partial = true;
  }
  try {
    const result = await getJson<{ data: Insight[] }>(`${graph}/${id}/insights`, { metric: 'shares' }, token);
    shares = result.data || [];
  } catch {
    // Shares is not returned for every Threads post/account.
  }
  return { data: [...core, ...shares], partial };
}

export async function syncThreads(token: string): Promise<ProviderResult> {
  const warnings = new Set<string>();
  let followers = 0;
  try {
    const account = await getJson<{ data: Insight[] }>(`${graph}/me/threads_insights`, { metric: 'followers_count' }, token);
    followers = value(account.data || [], 'followers_count');
  } catch {
    warnings.add('Threads 粉絲數目前無法讀取，但貼文同步仍會繼續。');
  }

  const posts = await getAllPages<ThreadPost>(`${graph}/me/threads`, {
    fields: 'id,text,timestamp,permalink,media_type',
    limit: 100,
  }, token);
  const contents = await mapWithConcurrency(posts, 4, async (post): Promise<NormalizedContent> => {
    const insights = await postInsights(post.id, token);
    if (insights.partial) warnings.add('Threads 部分貼文沒有提供完整 Insights；貼文基本資料仍已同步。');
    const likes = value(insights.data, 'likes');
    const comments = value(insights.data, 'replies');
    const reposts = value(insights.data, 'reposts');
    const quotes = value(insights.data, 'quotes');
    const directShares = value(insights.data, 'shares');
    const views = value(insights.data, 'views');
    return {
      id: `threads-${post.id}`,
      nativeContentId: post.id,
      platform: 'Threads',
      type: 'Threads Post',
      title: (post.text || 'Threads 貼文').slice(0, 100),
      caption: post.text || '',
      publishedAt: post.timestamp,
      views,
      impressions: views,
      // The public Threads API exposes views, not a per-post unique-viewer value.
      // Keep reach empty so the dashboard does not mislabel repeat views as people.
      reach: 0,
      engagement: likes + comments + reposts + quotes + directShares,
      likes,
      comments,
      shares: directShares + reposts + quotes,
      saves: 0,
      clicks: 0,
      messages: 0,
      campaignId: 'unassigned',
      campaignName: '尚未歸類',
      confidence: 'low',
      reviewStatus: 'suggested',
      url: post.permalink || '',
      permalink: post.permalink || null,
      metricAvailability: {
        views: insights.data.some((row) => row.name === 'views'),
        reach: false,
        impressions: false,
        engagement: true,
      },
      sourceMetricNotes: [
        'Threads API 提供 Views；未提供單篇 unique viewers 時，不會把 Views 冒充 Reach。',
        'Threads 分享欄彙整 direct shares、reposts 與 quotes。',
      ],
      lastSource: 'threads-api',
      lastUpdatedAt: new Date().toISOString(),
    };
  });

  if (!posts.length) warnings.add('Threads API 未回傳內容。請檢查 threads_basic 權限與 Token。');
  return {
    platform: 'Threads',
    contents,
    account: {
      followers,
      reach: 0,
      views: contents.reduce((sum, item) => sum + item.views, 0),
      engagement: contents.reduce((sum, item) => sum + item.engagement, 0),
    },
    warnings: [...warnings],
  };
}
