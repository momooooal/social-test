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
    viewsKnownContentCount: contents.filter((item) => metricDisplay(item, 'views').available).length,
    viewsMissingContentCount: contents.filter((item) => !metricDisplay(item, 'views').available).length,
    reachKnownContentCount: contents.filter((item) => metricDisplay(item, 'reach').available).length,
    reachMissingContentCount: contents.filter((item) => !metricDisplay(item, 'reach').available).length,
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

function crossPostFingerprint(content: SocialContent) {
  return (content.caption || content.title || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/@[\w.]+/g, ' ')
    .replace(/#[^\s#，,。!！?？]+/g, ' ')
    .replace(/[\s\p{P}\p{S}]+/gu, '')
    .slice(0, 1200);
}

function trigrams(value: string) {
  const set = new Set<string>();
  if (value.length < 3) { if (value) set.add(value); return set; }
  for (let i = 0; i <= value.length - 3; i += 1) set.add(value.slice(i, i + 3));
  return set;
}

function textSimilarity(a: string, b: string) {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const aa = trigrams(a), bb = trigrams(b);
  if (!aa.size || !bb.size) return 0;
  let common = 0;
  aa.forEach((x) => { if (bb.has(x)) common += 1; });
  return (2 * common) / (aa.size + bb.size);
}

function contentTime(content: SocialContent) {
  const raw = content.publishedAtRaw || content.publishedAt;
  const time = new Date(raw).getTime();
  return Number.isFinite(time) ? time : new Date(content.publishedAt.slice(0, 10)).getTime();
}

export interface CrossPublishedGroup {
  id: string;
  title: string;
  publishedAt: string;
  platforms: string[];
  items: SocialContent[];
  views: number;
  reach: number;
  engagement: number;
  similarity: number;
}

/**
 * Groups mirrored / cross-published content while preserving one independent row per platform.
 * The group is a creative-level view only: platform KPIs still count Facebook and Instagram separately.
 * Cross-platform reach is an arithmetic total and MUST NOT be described as de-duplicated people.
 */
export function crossPublishedGroups(contents: SocialContent[]): CrossPublishedGroup[] {
  const candidates = contents
    .filter((item) => item.reviewStatus !== 'excluded' && (item.platform === 'Facebook' || item.platform === 'Instagram'))
    .map((item) => ({ item, fp: crossPostFingerprint(item), time: contentTime(item) }))
    .filter((row) => row.fp.length >= 24 && Number.isFinite(row.time));

  const groups: CrossPublishedGroup[] = [];
  const used = new Set<string>();
  for (let i = 0; i < candidates.length; i += 1) {
    const a = candidates[i];
    if (used.has(a.item.id)) continue;
    let best: { row: typeof a; score: number } | null = null;
    for (let j = i + 1; j < candidates.length; j += 1) {
      const b = candidates[j];
      if (used.has(b.item.id) || b.item.platform === a.item.platform) continue;
      const withinThirtyMinutes = Math.abs(a.time - b.time) <= 30 * 60 * 1000;
      if (!withinThirtyMinutes) continue;
      const score = textSimilarity(a.fp, b.fp);
      if (score >= 0.78 && (!best || score > best.score)) best = { row: b, score };
    }
    if (!best) continue;
    const matches = [a.item, best.row.item];
    matches.forEach((item) => used.add(item.id));
    groups.push({
      id: `cross:${matches.map((item) => `${item.platform}:${item.nativeContentId || item.id}`).sort().join('|')}`,
      title: matches[0].title,
      publishedAt: matches.map((item) => item.publishedAt).sort()[0],
      platforms: matches.map((item) => item.platform),
      items: matches,
      views: matches.reduce((sum, item) => sum + Number(item.views || 0), 0),
      reach: matches.reduce((sum, item) => sum + Number(item.reach || 0), 0),
      engagement: matches.reduce((sum, item) => sum + Number(item.engagement || 0), 0),
      similarity: best.score,
    });
  }
  return groups.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

export function metricDisplay(content: SocialContent, metric: 'views' | 'reach' | 'impressions') {
  const availability = content.metricAvailability?.[metric];
  if (availability === false) return { available: false, value: null as number | null };
  // Backward-compatible migration for FB CSV rows imported by the previous build:
  // the user's Meta export contains no per-post Views/Reach columns, so zero was
  // merely a placeholder, not measured performance.
  const notes = (content.sourceMetricNotes ?? []).join(' ');
  const oldFacebookExport = content.platform === 'Facebook' && /Facebook Meta.*匯出/.test(notes);
  if (availability === undefined && oldFacebookExport && Number(content[metric] ?? 0) === 0 && (metric === 'views' || metric === 'reach')) {
    return { available: false, value: null as number | null };
  }
  return { available: true, value: Number(content[metric] ?? 0) };
}
