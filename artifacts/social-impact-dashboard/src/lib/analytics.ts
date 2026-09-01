import type { Campaign, ContentSnapshot, Interaction, SocialContent, WorkspaceData } from './workspace-types';

export function effectiveCampaignId(content: SocialContent) {
  if (content.reviewStatus === 'excluded') return null;
  return content.manualCampaignId || content.campaignId || content.suggestedCampaignId || null;
}

export function contentsForCampaign(data: WorkspaceData, campaignId: string) {
  return data.contents.filter((content) => effectiveCampaignId(content) === campaignId);
}

export function effectiveInteractionCampaignId(item: Interaction) {
  if (item.excluded || item.reviewStatus === 'excluded') return null;
  return item.manualCampaignId || item.campaignId || null;
}

export function interactionsForCampaign(data: WorkspaceData, campaignId: string) {
  return data.interactions.filter((item) => effectiveInteractionCampaignId(item) === campaignId);
}

export function calculateCampaignMetrics(data: WorkspaceData, campaign: Campaign) {
  const contents = contentsForCampaign(data, campaign.id);
  const interactions = interactionsForCampaign(data, campaign.id);
  const sum = (key: keyof SocialContent) => contents.reduce((total, item) => total + Number(item[key] ?? 0), 0);
  const platform = (name: string) => {
    const rows = contents.filter((item) => item.platform === name);
    return { contentCount: rows.length, reach: rows.reduce((t, x) => t + x.reach, 0), views: rows.reduce((t, x) => t + x.views, 0), engagement: rows.reduce((t, x) => t + x.engagement, 0) };
  };
  const conversationCount = interactions.reduce((total, item) => total + Number(item.conversationCount ?? (item.anonymousConversationId ? 1 : 0)), 0);
  const messageCount = interactions.reduce((total, item) => total + Number(item.messageCount ?? 1), 0);
  const reach = sum('reach');
  const engagement = sum('engagement');
  return {
    contentCount: contents.length,
    views: sum('views'), reach, impressions: sum('impressions'), engagement,
    engagementRate: reach ? engagement / reach * 100 : 0,
    likes: sum('likes'), comments: sum('comments'), shares: sum('shares'), saves: sum('saves'), clicks: sum('clicks'),
    messages: sum('messages'), conversationCount, messageCount,
    platforms: { Facebook: platform('Facebook'), Instagram: platform('Instagram'), Threads: platform('Threads') },
    types: {
      Post: contents.filter((x) => x.type === 'Post').length,
      Reel: contents.filter((x) => x.type === 'Reel').length,
      Story: contents.filter((x) => x.type === 'Story').length,
      ThreadsPost: contents.filter((x) => x.type === 'Threads Post').length,
    },
    contents,
    interactions,
  };
}

export function campaignTopics(interactions: Interaction[]) {
  const map = new Map<string, number>();
  for (const item of interactions.filter((x) => !x.excluded)) {
    const topic = item.manualTopic || item.topic || item.suggestedTopic || '其他';
    map.set(topic, (map.get(topic) ?? 0) + Number(item.conversationCount ?? 1));
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

export function recommendationFromTopics(interactions: Interaction[]) {
  const topics = campaignTopics(interactions);
  const total = topics.reduce((s, [, count]) => s + count, 0) || 1;
  const top = topics[0];
  if (!top) return { title: '目前沒有足夠的詢問資料', body: '累積更多留言與私訊後，系統會依常見問題產生宣傳改善建議。', evidence: '目前 0 筆可分析詢問。' };
  const [topic, count] = top;
  const pct = Math.round(count / total * 100);
  const rules: Record<string, string> = {
    '交通': '建議下一次把大眾運輸方式、最近站點與步行路線直接放進主視覺或報名頁前段。',
    '停車': '建議下一次把汽機車停車位置、容量與替代停車點直接放進主視覺或報名頁前段。',
    '名額 / 候補': '建議公開候補機制、遞補順序、通知方式與預計通知時間，降低重複詢問。',
    '報名方式': '建議把報名入口、報名步驟與截止時間前置，並在高互動貼文中固定重複一次。',
    '時間 / 日期': '建議把活動日期、報到與正式開始時間做成獨立資訊區塊，避免埋在長文案中。',
    '資格 / 參加對象': '建議在主視覺直接寫清楚適用年齡、資格與是否可攜伴，降低不確定感。',
    '天候': '建議事前公布雨備、停辦或延期判斷時間，並保留單一最新公告入口。',
  };
  return {
    title: `先把「${topic}」說清楚。`,
    body: rules[topic] ?? `「${topic}」是目前最常見的詢問主題，建議把相關答案前置到主視覺、報名頁或置頂留言。`,
    evidence: `${pct}% 的有效詢問與「${topic}」有關（${count} / ${total}）。`,
  };
}

export function dataQuality(data: WorkspaceData) {
  const contents = data.contents;
  if (!contents.length) return { completeness: 0, confidence: 0, duplicates: 0, pending: 0, unassigned: 0, missingUrl: 0 };
  const checks = contents.map((item) => [item.id, item.platform, item.title, item.publishedAt, item.views, item.reach].filter((value) => value !== '' && value !== null && value !== undefined).length / 6);
  const completeness = checks.reduce((a, b) => a + b, 0) / checks.length * 100;
  const confidenceScore = contents.reduce((sum, item) => sum + (item.confidence === 'high' ? 1 : item.confidence === 'medium' ? .65 : .35), 0) / contents.length * 100;
  const seen = new Set<string>(); let duplicates = 0;
  for (const item of contents) { const key = item.stableKey || `${item.platform}:${item.nativeContentId || item.url || item.id}`; if (seen.has(key)) duplicates += 1; seen.add(key); }
  return {
    completeness,
    confidence: confidenceScore,
    duplicates,
    pending: contents.filter((item) => item.reviewStatus === 'suggested').length,
    unassigned: contents.filter((item) => !effectiveCampaignId(item) || effectiveCampaignId(item) === 'unassigned').length,
    missingUrl: contents.filter((item) => !(item.url || item.permalink)).length,
  };
}

export function growthForContent(content: SocialContent, snapshots: ContentSnapshot[], hours: number, metric: keyof ContentSnapshot = 'views') {
  const rows = snapshots.filter((item) => item.contentId === content.id).sort((a, b) => a.capturedAt.localeCompare(b.capturedAt));
  if (!rows.length) return { absolute: 0, percent: 0, previous: Number(content[metric as keyof SocialContent] ?? 0) };
  const current = Number(content[metric as keyof SocialContent] ?? 0);
  const cutoff = Date.now() - hours * 60 * 60 * 1000;
  let base = rows[0];
  for (const row of rows) if (new Date(row.capturedAt).getTime() <= cutoff) base = row;
  const previous = Number(base[metric] ?? 0);
  const absolute = current - previous;
  return { absolute, percent: previous > 0 ? absolute / previous * 100 : 0, previous };
}
