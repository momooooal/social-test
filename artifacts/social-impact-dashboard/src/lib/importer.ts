import type { SocialContent } from './workspace-types';

function normHeader(value: string) {
  return value.normalize('NFKC').toLowerCase().replace(/[\s_\-()（）/]/g, '');
}

const aliases: Record<string, string[]> = {
  id: ['contentid','postid','mediaid','貼文id','內容id','id'],
  nativeContentId: ['nativecontentid','postid','mediaid','貼文id','原生id'],
  platform: ['platform','平台','channel','來源平台'],
  type: ['contenttype','type','類型','內容類型','posttype','mediatype'],
  title: ['title','caption','text','message','內容','標題','貼文內容','文案'],
  publishedAt: ['publishedat','publishtime','createdtime','date','日期','發布日期','發布時間','時間'],
  views: ['views','viewscount','videoviews','playcount','觀看次數','觀看','播放次數','瀏覽次數'],
  impressions: ['impressions','impression','曝光次數','曝光'],
  reach: ['reach','accountsreached','觸及','觸及人數'],
  engagement: ['engagement','contentinteractions','interactions','互動','內容互動'],
  likes: ['likes','likecount','reactions','按讚','讚','心情'],
  comments: ['comments','commentcount','留言','回覆數'],
  shares: ['shares','sharecount','reposts','轉發','分享'],
  saves: ['saves','savecount','收藏'],
  clicks: ['clicks','linkclicks','點擊','連結點擊'],
  messages: ['messages','messagecount','私訊','訊息數'],
  conversationCount: ['conversationcount','conversations','對話數','私訊對話'],
  campaignId: ['campaignid','活動id'],
  campaignName: ['campaignname','campaign','活動','活動名稱'],
  url: ['permalink','url','link','網址','貼文網址','連結'],
};

function scoreHeader(header: string, candidate: string) {
  const h = normHeader(header), c = normHeader(candidate);
  if (h === c) return 100;
  if (h.includes(c) || c.includes(h)) return 70;
  return 0;
}

function findField(row: Record<string, unknown>, field: keyof typeof aliases) {
  let best: { score: number; value: unknown } | null = null;
  for (const [header, value] of Object.entries(row)) {
    for (const candidate of aliases[field]) {
      const score = scoreHeader(header, candidate);
      if (!best || score > best.score) best = { score, value };
    }
  }
  return best && best.score >= 70 ? best.value : undefined;
}

function numeric(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const cleaned = String(value ?? '').replace(/[,，\s%]/g, '').trim();
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function resolvePlatform(value: unknown): SocialContent['platform'] {
  const text = String(value ?? '').toLowerCase();
  if (text.includes('instagram') || text === 'ig') return 'Instagram';
  if (text.includes('thread')) return 'Threads';
  return 'Facebook';
}

function resolveType(value: unknown, platform: SocialContent['platform']): SocialContent['type'] {
  if (platform === 'Threads') return 'Threads Post';
  const text = String(value ?? '').toLowerCase();
  if (text.includes('reel')) return 'Reel';
  if (text.includes('story') || text.includes('限時')) return 'Story';
  return 'Post';
}

function resolveDate(value: unknown) {
  const raw = String(value ?? '').trim();
  if (!raw) return new Date().toISOString().slice(0, 10);
  const date = new Date(raw);
  if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  return raw.replace(/[./]/g, '-').slice(0, 10);
}

export interface NormalizedRowResult {
  content: SocialContent | null;
  warnings: string[];
}

export function normalizeImportedContent(row: Record<string, unknown>, index: number): NormalizedRowResult {
  const warnings: string[] = [];
  const platform = resolvePlatform(findField(row, 'platform'));
  const title = String(findField(row, 'title') ?? '').trim();
  if (!title) return { content: null, warnings: ['缺少可辨識的標題 / caption / 文案欄位'] };
  const rawId = findField(row, 'id');
  const nativeContentId = String(findField(row, 'nativeContentId') ?? rawId ?? '').trim() || null;
  const url = String(findField(row, 'url') ?? '').trim();
  const viewsField = findField(row, 'views');
  const reachField = findField(row, 'reach');
  const impressionField = findField(row, 'impressions');
  if (viewsField === undefined && impressionField !== undefined) warnings.push('缺少 Views：保留 0，不會把曝光誤當觀看');
  if (reachField === undefined) warnings.push('缺少 Reach：觸及保留 0');

  const id = String(rawId ?? nativeContentId ?? `import-${Date.now()}-${index}`);
  const content: SocialContent = {
    id,
    nativeContentId,
    platform,
    type: resolveType(findField(row, 'type'), platform),
    title,
    caption: title,
    publishedAt: resolveDate(findField(row, 'publishedAt')),
    views: numeric(viewsField),
    impressions: numeric(impressionField),
    reach: numeric(reachField),
    engagement: numeric(findField(row, 'engagement')),
    likes: numeric(findField(row, 'likes')),
    comments: numeric(findField(row, 'comments')),
    shares: numeric(findField(row, 'shares')),
    saves: numeric(findField(row, 'saves')),
    clicks: numeric(findField(row, 'clicks')),
    messages: numeric(findField(row, 'messages')),
    conversationCount: numeric(findField(row, 'conversationCount')),
    campaignId: String(findField(row, 'campaignId') ?? 'unassigned'),
    campaignName: String(findField(row, 'campaignName') ?? '尚未歸類'),
    confidence: 'low',
    reviewStatus: 'suggested',
    url,
    permalink: url || null,
    classificationReasons: [],
  };
  return { content, warnings };
}

export type ImportKind = 'contents' | 'interactions' | 'monthlyMetrics' | 'platforms';

function normalizedHeaders(row: Record<string, unknown>) {
  return Object.keys(row).map(normHeader);
}

export function detectImportKind(rows: Record<string, unknown>[]): ImportKind {
  const first = rows[0];
  if (!first) return 'contents';
  const headers = normalizedHeaders(first);
  const has = (...terms: string[]) => terms.some((term) => headers.some((h) => h.includes(normHeader(term))));
  if (has('對話數', 'conversationcount', '訊息文字', '私訊內容', '問題主題') && has('source', '來源', 'platform', '平台')) return 'interactions';
  if (has('month', '月份') && (has('followers', '追蹤者', '粉絲') || has('reach', '觸及'))) return 'monthlyMetrics';
  if (has('followers', '追蹤者', '粉絲') && has('platform', '平台') && !has('caption', '貼文內容', '發布時間')) return 'platforms';
  return 'contents';
}

function findAny(row: Record<string, unknown>, candidates: string[]) {
  let best: { score: number; value: unknown } | undefined;
  for (const [header, value] of Object.entries(row)) {
    for (const candidate of candidates) {
      const score = scoreHeader(header, candidate);
      if (!best || score > best.score) best = { score, value };
    }
  }
  return best && best.score >= 70 ? best.value : undefined;
}

export function normalizeImportedInteraction(row: Record<string, unknown>, index: number) {
  const text = String(findAny(row, ['text','message','body','訊息文字','私訊內容','留言內容','問題','內容']) ?? '').trim();
  if (!text) return null;
  const source = String(findAny(row, ['source','來源','platform','平台','channel']) ?? '手動匯入');
  const createdAt = resolveDate(findAny(row, ['createdat','timestamp','date','時間','日期','建立時間']));
  const campaignId = String(findAny(row, ['campaignid','活動id']) ?? '');
  const topic = String(findAny(row, ['topic','問題主題','分類','類別']) ?? '其他');
  return {
    id: String(findAny(row, ['interactionid','messageid','id','訊息id']) ?? `interaction-${Date.now()}-${index}`),
    source,
    platform: resolvePlatform(source),
    text,
    createdAt,
    campaignId: campaignId || null,
    manualCampaignId: null,
    topic,
    suggestedTopic: topic,
    manualTopic: null,
    confidence: 'low' as const,
    reviewStatus: 'suggested' as const,
    anonymousConversationId: String(findAny(row, ['anonymousconversationid','conversationid','對話id','匿名對話id']) ?? '') || null,
    conversationCount: numeric(findAny(row, ['conversationcount','conversations','對話數'])) || 1,
    messageCount: numeric(findAny(row, ['messagecount','messages','訊息數','訊息則數'])) || 1,
  };
}

export function normalizeImportedMonthlyMetric(row: Record<string, unknown>) {
  const month = String(findAny(row, ['month','月份','年月']) ?? '').trim();
  if (!month) return null;
  return {
    month,
    views: numeric(findAny(row, aliases.views)),
    reach: numeric(findAny(row, aliases.reach)),
    engagement: numeric(findAny(row, aliases.engagement)),
    messages: numeric(findAny(row, aliases.messages)),
    followers: numeric(findAny(row, ['followers','followercount','粉絲','追蹤者','追蹤人數'])),
  };
}

export function normalizeImportedPlatformMetric(row: Record<string, unknown>) {
  const rawPlatform = findAny(row, ['platform','平台','channel','來源平台']);
  if (rawPlatform === undefined) return null;
  const platform = resolvePlatform(rawPlatform);
  return {
    platform,
    followers: numeric(findAny(row, ['followers','followercount','粉絲','追蹤者','追蹤人數'])),
    growth: numeric(findAny(row, ['growth','followgrowth','追蹤成長','粉絲成長','成長率'])),
    views: numeric(findAny(row, aliases.views)),
    reach: numeric(findAny(row, aliases.reach)),
    engagement: numeric(findAny(row, aliases.engagement)),
    posts: numeric(findAny(row, ['posts','postcount','貼文數','內容數'])),
    reels: numeric(findAny(row, ['reels','reelcount','reels數'])),
    stories: numeric(findAny(row, ['stories','storycount','限時動態數','story數'])),
    messages: numeric(findAny(row, aliases.messages)),
  };
}
