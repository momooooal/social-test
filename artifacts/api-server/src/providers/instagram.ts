import { getAllPages, getJson, mapWithConcurrency } from './http';
import type { NormalizedContent, ProviderResult } from './types';

const version = process.env.META_API_VERSION || 'v25.0';
const graph = `https://graph.facebook.com/${version}`;
type Media = {
  id: string;
  caption?: string;
  media_type?: string;
  media_product_type?: string;
  timestamp: string;
  permalink?: string;
  like_count?: number;
  comments_count?: number;
};
type Insight = { name: string; values?: Array<{ value: number }>; total_value?: { value: number } };

function value(data: Insight[], names: string[]) {
  for (const name of names) {
    const item = data.find((x) => x.name === name);
    const metricValue = item?.total_value?.value ?? item?.values?.at(-1)?.value;
    if (typeof metricValue === 'number') return metricValue;
  }
  return 0;
}

async function insightGroup(id: string, token: string, metrics: string[]) {
  try {
    const result = await getJson<{ data: Insight[] }>(`${graph}/${id}/insights`, { metric: metrics.join(',') }, token);
    return { data: result.data || [], partial: false };
  } catch {
    // A single unsupported metric makes Meta reject the entire batch. Retry each
    // metric independently so one media type does not lose every available value.
    const rows = await Promise.all(metrics.map(async (metric) => {
      try {
        const result = await getJson<{ data: Insight[] }>(`${graph}/${id}/insights`, { metric }, token);
        return result.data || [];
      } catch {
        return [];
      }
    }));
    return { data: rows.flat(), partial: rows.some((row) => !row.length) };
  }
}

async function mediaInsights(id: string, token: string) {
  const [distribution, interaction] = await Promise.all([
    insightGroup(id, token, ['views', 'reach']),
    insightGroup(id, token, ['total_interactions', 'shares', 'saved']),
  ]);
  return { data: [...distribution.data, ...interaction.data], partial: distribution.partial || interaction.partial };
}

function contentType(media: Media): NormalizedContent['type'] {
  const product = (media.media_product_type || '').toUpperCase();
  if (product === 'REELS') return 'Reel';
  if (product === 'STORY') return 'Story';
  return 'Post';
}

export async function syncInstagram(userId: string, token: string): Promise<ProviderResult> {
  const warnings = new Set<string>();
  let followers = 0;
  try {
    const profile = await getJson<{ followers_count?: number }>(`${graph}/${userId}`, { fields: 'followers_count' }, token);
    followers = Number(profile.followers_count || 0);
  } catch {
    warnings.add('Instagram 粉絲數目前無法讀取，但內容同步仍會繼續。');
  }

  const media = await getAllPages<Media>(`${graph}/${userId}/media`, {
    fields: 'id,caption,media_type,media_product_type,timestamp,permalink,like_count,comments_count',
    limit: 100,
  }, token);

  let stories: Media[] = [];
  try {
    stories = await getAllPages<Media>(`${graph}/${userId}/stories`, {
      fields: 'id,caption,media_type,media_product_type,timestamp,permalink',
      limit: 100,
    }, token, 100);
  } catch {
    warnings.add('Instagram 限時動態目前無法讀取；一般貼文與 Reels 仍會同步。');
  }

  const byId = new Map([...media, ...stories].map((item) => [item.id, item]));
  const allMedia = [...byId.values()];
  const contents = await mapWithConcurrency(allMedia, 4, async (item): Promise<NormalizedContent> => {
    const insights = await mediaInsights(item.id, token);
    if (insights.partial) warnings.add('Instagram 部分內容類型沒有提供完整 Insights；可用欄位仍已保留。');
    const likes = Number(item.like_count || value(insights.data, ['likes']));
    const comments = Number(item.comments_count || value(insights.data, ['comments']));
    const shares = value(insights.data, ['shares']);
    const saves = value(insights.data, ['saved', 'saves']);
    const reach = value(insights.data, ['reach']);
    const views = value(insights.data, ['views']);
    const engagement = value(insights.data, ['total_interactions']) || likes + comments + shares + saves;
    return {
      id: `instagram-${item.id}`,
      nativeContentId: item.id,
      platform: 'Instagram',
      type: contentType(item),
      title: (item.caption || 'Instagram 內容').slice(0, 100),
      caption: item.caption || '',
      publishedAt: item.timestamp,
      views,
      impressions: views,
      reach,
      engagement,
      likes,
      comments,
      shares,
      saves,
      clicks: 0,
      messages: 0,
      campaignId: 'unassigned',
      campaignName: '尚未歸類',
      confidence: 'low',
      reviewStatus: 'suggested',
      url: item.permalink || '',
      permalink: item.permalink || null,
      metricAvailability: {
        views: insights.data.some((row) => row.name === 'views'),
        reach: insights.data.some((row) => row.name === 'reach'),
        impressions: false,
        engagement: true,
      },
      sourceMetricNotes: [
        'Instagram Views 與 Reach 依官方 Media Insights 分開保存。',
        '個別內容類型未提供的 metric 會標示未提供，不會臆測為 0。',
      ],
      lastSource: 'instagram-api',
      lastUpdatedAt: new Date().toISOString(),
    };
  });

  if (!media.length && !stories.length) warnings.add('Instagram API 未回傳內容；僅支援已連結 Facebook Page 的 Professional account。');
  return {
    platform: 'Instagram',
    contents,
    account: {
      followers,
      reach: contents.reduce((sum, item) => sum + item.reach, 0),
      views: contents.reduce((sum, item) => sum + item.views, 0),
      engagement: contents.reduce((sum, item) => sum + item.engagement, 0),
    },
    warnings: [...warnings],
  };
}
