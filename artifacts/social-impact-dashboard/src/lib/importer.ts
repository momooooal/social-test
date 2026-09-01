import type { Interaction, SocialContent, ThreadsPostInsights } from './workspace-types';

function normHeader(value: string) {
  return value.normalize('NFKC').toLowerCase().replace(/[\s_\-()（）/]/g, '');
}

const aliases: Record<string, string[]> = {
  id: ['contentid','postid','mediaid','貼文id','貼文編號','內容id','id'],
  nativeContentId: ['nativecontentid','postid','mediaid','貼文id','貼文編號','原生id'],
  platform: ['platform','平台','channel','來源平台'],
  type: ['contenttype','type','類型','內容類型','posttype','mediatype','貼文類型'],
  title: ['title','caption','text','message','內容','標題','說明','貼文內容','文案'],
  caption: ['caption','description','message','說明','內容','貼文內容','文案','標題'],
  publishedAt: ['publishedat','publishtime','createdtime','發佈時間','發布時間','發布日期','建立時間','時間'],
  views: ['views','viewscount','videoviews','playcount','觀看次數','觀看','播放次數','瀏覽次數','檢視次數','影片播放次數','影片瀏覽次數','影片觀看次數','reels播放次數','reels瀏覽次數'],
  impressions: ['impressions','impression','曝光次數','曝光'],
  reach: ['reach','accountsreached','觸及','觸及人數'],
  engagement: ['engagement','contentinteractions','interactions','互動','內容互動','心情留言和分享次數'],
  likes: ['likes','likecount','reactions','按讚數','按讚','讚','心情'],
  comments: ['comments','commentcount','留言數','留言','回覆數','replies'],
  shares: ['shares','sharecount','reposts','轉發','分享'],
  saves: ['saves','savecount','儲存次數','收藏'],
  clicks: ['clicks','linkclicks','點擊','連結點擊'],
  messages: ['messages','messagecount','私訊','訊息數'],
  conversationCount: ['conversationcount','conversations','對話數','私訊對話'],
  campaignId: ['campaignid','活動id'],
  campaignName: ['campaignname','campaign','活動','活動名稱'],
  url: ['permalink','永久連結','url','link','網址','貼文網址','連結'],
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

function findExact(row: Record<string, unknown>, names: string[]) {
  const keys = Object.keys(row);
  for (const name of names) {
    const wanted = normHeader(name);
    const key = keys.find((item) => normHeader(item) === wanted);
    if (key !== undefined) return row[key];
  }
  return undefined;
}

function numeric(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  let text = String(value ?? '').replace(/[,，\s%]/g, '').trim();
  if (!text || text === '-' || /^n\/?a$/i.test(text)) return 0;
  let multiplier = 1;
  if (/萬$/.test(text)) { multiplier = 10000; text = text.replace(/萬$/, ''); }
  else if (/k$/i.test(text)) { multiplier = 1000; text = text.replace(/k$/i, ''); }
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed * multiplier : 0;
}

function inferPlatform(row: Record<string, unknown>, explicit?: unknown): SocialContent['platform'] {
  const value = String(explicit ?? '').toLowerCase();
  if (value.includes('instagram') || value === 'ig') return 'Instagram';
  if (value.includes('thread')) return 'Threads';
  const headers = Object.keys(row).map(normHeader);
  const type = String(findExact(row, ['貼文類型']) ?? '').toLowerCase();
  if (headers.includes(normHeader('帳號用戶名稱')) || headers.includes(normHeader('Instagram 帳號編號')) || type.startsWith('ig')) return 'Instagram';
  if (headers.includes(normHeader('粉絲專頁編號')) || headers.includes(normHeader('粉絲專頁名稱'))) return 'Facebook';
  if (headers.some((h) => h.includes('threads')) || type.includes('thread')) return 'Threads';
  return 'Facebook';
}

function resolveType(value: unknown, platform: SocialContent['platform']): SocialContent['type'] {
  if (platform === 'Threads') return 'Threads Post';
  const text = String(value ?? '').toLowerCase();
  if (text.includes('reel')) return 'Reel';
  if (text.includes('story') || text.includes('限時')) return 'Story';
  if (text.includes('直播') || text.includes('live')) return 'Live';
  if (text.includes('影片') || text.includes('video')) return 'Video';
  return 'Post';
}

function resolveDate(value: unknown) {
  const raw = String(value ?? '').trim();
  if (!raw || raw === '總期間') return '';
  let m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+\d{1,2}:\d{2})?/);
  if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  m = raw.match(/^(\d{4})[/.\-](\d{1,2})[/.\-](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  const date = new Date(raw);
  if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  return raw.replace(/[./]/g, '-').slice(0, 10);
}

function resolveDateTime(value: unknown) {
  const raw = String(value ?? '').trim();
  if (!raw || raw === '總期間') return '';
  let m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}T${(m[4] ?? '00').padStart(2, '0')}:${m[5] ?? '00'}:00`;
  m = raw.match(/^(\d{4})[/.\-](\d{1,2})[/.\-](\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}T${(m[4] ?? '00').padStart(2, '0')}:${m[5] ?? '00'}:00`;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function firstLine(value: unknown) {
  const text = String(value ?? '').trim();
  return (text.split(/\r?\n/).find(Boolean) ?? text).trim().slice(0, 180);
}

function hashtags(text: string) {
  return [...new Set(text.match(/#[^\s#，,。!！?？]{2,50}/g) ?? [])];
}

export interface NormalizedRowResult {
  content: SocialContent | null;
  warnings: string[];
}

export function normalizeImportedContent(row: Record<string, unknown>, index: number): NormalizedRowResult {
  const warnings: string[] = [];
  const platform = inferPlatform(row, findField(row, 'platform'));
  const caption = String(findField(row, 'caption') ?? findField(row, 'title') ?? '').trim();
  const title = firstLine(findExact(row, ['標題']) ?? caption);
  if (!title && !caption) return { content: null, warnings: ['缺少可辨識的標題 / caption / 說明 / 文案欄位'] };
  const rawId = findField(row, 'id');
  const nativeContentId = String(findField(row, 'nativeContentId') ?? rawId ?? '').trim() || null;
  const url = String(findField(row, 'url') ?? '').trim();
  const viewsField = findField(row, 'views');
  const reachField = findField(row, 'reach');
  const impressionField = findField(row, 'impressions');
  if (viewsField === undefined && impressionField !== undefined) warnings.push('缺少 Views：保留 0，不會把曝光誤當觀看');
  if (reachField === undefined) warnings.push('缺少 Reach：觸及保留 0');
  const likes = numeric(findField(row, 'likes'));
  const comments = numeric(findField(row, 'comments'));
  const shares = numeric(findField(row, 'shares'));
  const saves = numeric(findField(row, 'saves'));
  const directEngagement = findField(row, 'engagement');
  const publishedRaw = findExact(row, ['發佈時間','發布時間','Published at','Publish time','Created time']) ?? findField(row, 'publishedAt');
  const publishedAt = resolveDate(publishedRaw) || new Date().toISOString().slice(0, 10);

  const id = String(rawId ?? nativeContentId ?? `import-${Date.now()}-${index}`);
  const content: SocialContent = {
    id,
    nativeContentId,
    platform,
    type: resolveType(findField(row, 'type'), platform),
    title: title || caption.slice(0, 180),
    caption: caption || title,
    hashtags: hashtags(caption),
    publishedAt,
    publishedAtRaw: resolveDateTime(publishedRaw) || publishedAt,
    views: numeric(viewsField),
    impressions: numeric(impressionField),
    reach: numeric(reachField),
    engagement: directEngagement === undefined ? likes + comments + shares + saves : numeric(directEngagement),
    likes, comments, shares, saves,
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
export type MetaExportKind = 'facebook-content-export' | 'instagram-content-export' | null;

function normalizedHeaders(row: Record<string, unknown>) { return Object.keys(row).map(normHeader); }

export function detectMetaExport(rows: Record<string, unknown>[]): MetaExportKind {
  const first = rows[0]; if (!first) return null;
  const headers = normalizedHeaders(first);
  const has = (name: string) => headers.includes(normHeader(name));
  if (has('貼文編號') && has('粉絲專頁編號') && has('粉絲專頁名稱') && has('永久連結') && has('發佈時間')) return 'facebook-content-export';
  if (has('貼文編號') && has('帳號編號') && has('帳號用戶名稱') && has('永久連結') && has('瀏覽次數') && has('觸及人數')) return 'instagram-content-export';
  return null;
}

export interface MetaContentImportResult {
  kind: Exclude<MetaExportKind, null>;
  contents: SocialContent[];
  warnings: string[];
  sourceRows: number;
}

/** Meta Business Suite Facebook export used by the user's real file: one post is repeated once per report date. */
function normalizeFacebookMetaExport(rows: Record<string, unknown>[]): MetaContentImportResult {
  const groups = new Map<string, Record<string, unknown>[]>();
  rows.forEach((row, index) => {
    const id = String(findExact(row, ['貼文編號']) ?? `fb-${index}`);
    groups.set(id, [...(groups.get(id) ?? []), row]);
  });
  const contents: SocialContent[] = [];
  const summaryStyle = rows.some((row) => findExact(row, ['觀看次數']) !== undefined && findExact(row, ['瀏覽人數']) !== undefined && findExact(row, ['互動次數']) !== undefined);
  for (const [id, group] of groups) {
    const first = group[0];
    const caption = String(findExact(first, ['說明']) ?? findExact(first, ['標題']) ?? '').trim();
    const title = firstLine(findExact(first, ['標題']) ?? caption);
    const url = String(findExact(first, ['永久連結']) ?? '').trim();
    // Old Meta export can repeat one post per report date. The newer "內容 / 發佈時間 / 摘要" export is one row per post.
    // sum() is therefore correct for the old daily-increment export and identical to the source value for the one-row summary export.
    const sum = (names: string[]) => group.reduce((total, row) => total + numeric(findExact(row, names)), 0);
    const likes = sum(['心情數','按讚數','讚','心情']);
    const comments = sum(['留言數','留言']);
    const shares = sum(['分享','分享次數']);
    const saves = sum(['儲存次數','收藏']);
    const directEngagement = sum(['互動次數','內容互動']);
    const combinedLegacy = sum(['心情、留言和分享次數','心情留言和分享次數']);
    const viewsAvailable = findExact(first, ['觀看次數','瀏覽次數','影片觀看次數','播放次數','檢視次數','影片播放次數','影片瀏覽次數','Reels 播放次數','Reels瀏覽次數']) !== undefined;
    // In the user's 2026 summary export, Facebook supplies both 曝光次數 and 瀏覽人數. Keep 瀏覽人數 as the people/reach-style metric and preserve its source note.
    const reachAvailable = findExact(first, ['瀏覽人數','觸及人數','觸及']) !== undefined;
    const impressionsAvailable = findExact(first, ['曝光次數','曝光']) !== undefined;
    const publishedRaw = findExact(first, ['發佈時間','發布時間']);
    contents.push({
      id, nativeContentId: id, platform: 'Facebook', type: resolveType(findExact(first, ['貼文類型']), 'Facebook'),
      title: title || `Facebook 內容 ${id}`, caption, hashtags: hashtags(caption),
      publishedAt: resolveDate(publishedRaw) || new Date().toISOString().slice(0, 10),
      publishedAtRaw: resolveDateTime(publishedRaw) || resolveDate(publishedRaw),
      views: sum(['觀看次數','瀏覽次數','影片觀看次數','播放次數','檢視次數','影片播放次數','影片瀏覽次數','Reels 播放次數','Reels瀏覽次數']),
      impressions: sum(['曝光次數','曝光']),
      reach: sum(['瀏覽人數','觸及人數','觸及']),
      engagement: directEngagement || combinedLegacy || likes + comments + shares + saves,
      likes, comments, shares, saves,
      clicks: sum(['連結點擊','點擊']), messages: 0, conversationCount: 0,
      followersGained: sum(['淨追蹤者人數','追蹤人數']),
      campaignId: 'unassigned', campaignName: '尚未歸類', confidence: 'low', reviewStatus: 'suggested', url, permalink: url || null,
      classificationReasons: [], sourceRowCount: group.length,
      metricAvailability: { views: viewsAvailable, reach: reachAvailable, impressions: impressionsAvailable, engagement: true },
      sourceMetricNotes: [
        summaryStyle ? 'Facebook Meta「內容 / 發佈時間 / 摘要」匯出：每篇內容一列' : 'Facebook Meta 匯出依貼文編號合併每日列',
        viewsAvailable ? '觀看使用 Meta 匯出欄位「觀看次數」' : '此 Facebook 匯出檔沒有逐篇觀看欄位；顯示「未提供」，不把 0 當成零觀看',
        reachAvailable ? (findExact(first, ['瀏覽人數']) !== undefined ? '人數型指標使用 Meta 匯出欄位「瀏覽人數」，Dashboard 置於觸及欄；跨平台合計不代表去重人數' : '使用 Meta 匯出的觸及欄位') : '此 Facebook 匯出檔沒有逐篇人數 / 觸及欄位',
        directEngagement ? '有效互動優先使用 Meta 匯出欄位「互動次數」；心情、留言、分享、儲存仍分欄保留' : (combinedLegacy ? '互動使用舊版合併欄位' : '互動由可取得的心情＋留言＋分享＋儲存加總'),
      ],
    });
  }
  return {
    kind: 'facebook-content-export', contents,
    warnings: summaryStyle
      ? [`已辨識新版 Facebook Meta 摘要匯出：${rows.length} 列 → ${contents.length} 則內容。`, 'FB「觀看次數」會進 Views，不會再顯示 0；「瀏覽人數」保留為人數型／觸及欄，並標示來源語意。']
      : [`已辨識 Facebook Meta 舊版逐日匯出：${rows.length} 列依「貼文編號」合併為 ${contents.length} 則內容，不會把每日列誤當成不同貼文。`, '檔案沒有提供的 Views / Reach 不會被網站自行猜測。'],
    sourceRows: rows.length,
  };
}

function normalizeInstagramMetaExport(rows: Record<string, unknown>[]): MetaContentImportResult {
  const contents = rows.map((row, index) => {
    const id = String(findExact(row, ['貼文編號']) ?? `ig-${index}`);
    const caption = String(findExact(row, ['說明']) ?? '').trim();
    const likes = numeric(findExact(row, ['按讚數']));
    const comments = numeric(findExact(row, ['留言數']));
    const shares = numeric(findExact(row, ['分享']));
    const saves = numeric(findExact(row, ['儲存次數']));
    const url = String(findExact(row, ['永久連結']) ?? '').trim();
    const rawType = findExact(row, ['貼文類型']);
    return {
      id, nativeContentId: id, platform: 'Instagram' as const, type: resolveType(rawType, 'Instagram'),
      title: firstLine(caption) || `Instagram 內容 ${id}`, caption, hashtags: hashtags(caption),
      // IMPORTANT: Meta IG has both 發佈時間 and 日期=總期間; only 發佈時間 is publication date.
      publishedAt: resolveDate(findExact(row, ['發佈時間','發布時間'])) || new Date().toISOString().slice(0, 10),
      publishedAtRaw: resolveDateTime(findExact(row, ['發佈時間','發布時間'])) || resolveDate(findExact(row, ['發佈時間','發布時間'])),
      views: numeric(findExact(row, ['瀏覽次數'])), reach: numeric(findExact(row, ['觸及人數'])), impressions: 0,
      engagement: likes + comments + shares + saves, likes, comments, shares, saves, clicks: 0, messages: 0, conversationCount: 0,
      followersGained: numeric(findExact(row, ['追蹤人數'])),
      campaignId: 'unassigned', campaignName: '尚未歸類', confidence: 'low' as const, reviewStatus: 'suggested' as const,
      url, permalink: url || null, classificationReasons: [], sourceRowCount: 1,
      metricAvailability: { views: true, reach: true, impressions: false, engagement: true },
      sourceMetricNotes: ['Instagram Meta 原生匯出', '互動以按讚＋留言＋分享＋儲存計算；「追蹤人數」保留為該內容帶來的追蹤成長'],
    } satisfies SocialContent;
  });
  return {
    kind: 'instagram-content-export', contents,
    warnings: [`已辨識 Instagram Meta 原生匯出：${contents.length} 則內容。`, 'IG 的「日期＝總期間」不會再被誤認成發布日期；系統固定使用「發佈時間」。', 'IG 檔沒有 platform 欄也不會再被誤判成 Facebook。'],
    sourceRows: rows.length,
  };
}

export function normalizeMetaContentExport(rows: Record<string, unknown>[]): MetaContentImportResult | null {
  const kind = detectMetaExport(rows);
  if (kind === 'facebook-content-export') return normalizeFacebookMetaExport(rows);
  if (kind === 'instagram-content-export') return normalizeInstagramMetaExport(rows);
  return null;
}

export function detectImportKind(rows: Record<string, unknown>[]): ImportKind {
  const first = rows[0]; if (!first) return 'contents';
  if (detectMetaExport(rows)) return 'contents';
  const headers = normalizedHeaders(first);
  const has = (...terms: string[]) => terms.some((term) => headers.some((h) => h.includes(normHeader(term))));
  if (has('對話數', 'conversationcount', '訊息文字', '私訊內容', '問題主題') && has('source', '來源', 'platform', '平台')) return 'interactions';
  if (has('month', '月份') && (has('followers', '追蹤者', '粉絲') || has('reach', '觸及'))) return 'monthlyMetrics';
  if (has('followers', '追蹤者', '粉絲') && has('platform', '平台') && !has('caption', '貼文內容', '發布時間')) return 'platforms';
  return 'contents';
}

function findAny(row: Record<string, unknown>, candidates: string[]) {
  let best: { score: number; value: unknown } | undefined;
  for (const [header, value] of Object.entries(row)) for (const candidate of candidates) {
    const score = scoreHeader(header, candidate); if (!best || score > best.score) best = { score, value };
  }
  return best && best.score >= 70 ? best.value : undefined;
}

export function normalizeImportedInteraction(row: Record<string, unknown>, index: number) {
  const text = String(findAny(row, ['text','message','body','訊息文字','私訊內容','留言內容','問題','內容']) ?? '').trim();
  if (!text) return null;
  const source = String(findAny(row, ['source','來源','platform','平台','channel']) ?? '手動匯入');
  const createdAt = resolveDate(findAny(row, ['createdat','timestamp','date','時間','日期','建立時間'])) || new Date().toISOString().slice(0, 10);
  const campaignId = String(findAny(row, ['campaignid','活動id']) ?? '');
  const topic = String(findAny(row, ['topic','問題主題','分類','類別']) ?? '其他');
  return {
    id: String(findAny(row, ['interactionid','messageid','id','訊息id']) ?? `interaction-${Date.now()}-${index}`), source,
    platform: inferPlatform(row, source), text, createdAt, campaignId: campaignId || null, manualCampaignId: null, topic, suggestedTopic: topic, manualTopic: null,
    confidence: 'low' as const, reviewStatus: 'suggested' as const,
    anonymousConversationId: String(findAny(row, ['anonymousconversationid','conversationid','對話id','匿名對話id']) ?? '') || null,
    conversationCount: numeric(findAny(row, ['conversationcount','conversations','對話數'])) || 1,
    messageCount: numeric(findAny(row, ['messagecount','messages','訊息數','訊息則數'])) || 1,
  };
}

export function normalizeImportedMonthlyMetric(row: Record<string, unknown>) {
  const month = String(findAny(row, ['month','月份','年月']) ?? '').trim(); if (!month) return null;
  return { month, views: numeric(findAny(row, aliases.views)), reach: numeric(findAny(row, aliases.reach)), engagement: numeric(findAny(row, aliases.engagement)), messages: numeric(findAny(row, aliases.messages)), followers: numeric(findAny(row, ['followers','followercount','粉絲','追蹤者','追蹤人數'])) };
}

export function normalizeImportedPlatformMetric(row: Record<string, unknown>) {
  const rawPlatform = findAny(row, ['platform','平台','channel','來源平台']); if (rawPlatform === undefined) return null;
  const platform = inferPlatform(row, rawPlatform);
  return { platform, followers: numeric(findAny(row, ['followers','followercount','粉絲','追蹤者','追蹤人數'])), growth: numeric(findAny(row, ['growth','followgrowth','追蹤成長','粉絲成長','成長率'])), views: numeric(findAny(row, aliases.views)), reach: numeric(findAny(row, aliases.reach)), engagement: numeric(findAny(row, aliases.engagement)), posts: numeric(findAny(row, ['posts','postcount','貼文數','內容數'])), reels: numeric(findAny(row, ['reels','reelcount','reels數'])), stories: numeric(findAny(row, ['stories','storycount','限時動態數','story數'])), messages: numeric(findAny(row, aliases.messages)) };
}

function parseLooseMetric(block: string, labels: string[]) {
  const lines = block.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (const line of lines) {
    for (const label of labels) {
      const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const after = line.match(new RegExp(`^${escaped}\\s*[:：]?\\s*([\\d,.]+(?:\\.\\d+)?(?:萬|[kK])?)$`, 'i'));
      if (after) return numeric(after[1]);
      const before = line.match(new RegExp(`^([\\d,.]+(?:\\.\\d+)?(?:萬|[kK])?)\\s*${escaped}$`, 'i'));
      if (before) return numeric(before[1]);
      const looseAfter = line.match(new RegExp(`${escaped}\\s*[:：]?\\s*([\\d,.]+(?:\\.\\d+)?(?:萬|[kK])?)`, 'i'));
      if (looseAfter) return numeric(looseAfter[1]);
      const looseBefore = line.match(new RegExp(`([\\d,.]+(?:\\.\\d+)?(?:萬|[kK])?)\\s*${escaped}`, 'i'));
      if (looseBefore) return numeric(looseBefore[1]);
    }
  }
  return 0;
}

function cleanThreadsText(text: string) {
  return text
    .replace(/\r/g, '')
    .replace(/\*\*/g, '')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '$1\n$2')
    .replace(/^svg\s*$/gim, '')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function escapedLabel(label: string) {
  return label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function labeledNumber(text: string, label: string, percent = false): number | undefined {
  const re = new RegExp(`(?:^|\\n)\\s*${escapedLabel(label)}\\s*(?:\\n|[:：]\\s*|\\s+)(?:\\*\\*)?([\\d,.]+)(?:\\*\\*)?\\s*${percent ? '%' : ''}`, 'im');
  const match = text.match(re);
  if (!match) return undefined;
  return numeric(match[1]);
}

function benchmarkAfter(text: string, label: string): string | undefined {
  const re = new RegExp(`(?:^|\\n)\\s*${escapedLabel(label)}\\s*(?:\\n|[:：]\\s*|\\s+)(?:\\*\\*)?[\\d,.]+%?(?:\\*\\*)?\\s*(較低|一般|高於)`, 'im');
  return text.match(re)?.[1];
}

function sectionPercent(text: string, sectionLabel: string, itemLabel: string): number | undefined {
  const start = text.indexOf(sectionLabel);
  if (start < 0) return undefined;
  const section = text.slice(start, start + 1800);
  return labeledNumber(section, itemLabel, true);
}

function threadsPostUrl(text: string) {
  return text.match(/https?:\/\/(?:www\.)?threads\.com\/@[^/\s]+\/post\/[^\s?#)]+/i)?.[0]?.replace(/[),，。]+$/, '') ?? '';
}

function threadsCaptionFromText(text: string) {
  const beforeSummary = text.split(/(?:^|\n)\s*摘要\s*(?:\n|$)/i)[0] ?? text;
  const lines = beforeSummary.split('\n').map((line) => line.trim()).filter(Boolean).filter((line) => {
    if (/^https?:\/\//i.test(line)) return false;
    if (/^@?[\w.]+$/.test(line)) return false;
    if (/^\d+\s*(秒|分鐘|小時|天|週|個月|年)$/.test(line)) return false;
    if (/^(svg|摘要)$/i.test(line)) return false;
    return true;
  });
  return [...lines].sort((a, b) => b.length - a.length)[0] ?? '';
}

export interface ThreadsCapturePost {
  href?: string;
  context?: string;
  nativeContentId?: string;
  accountHandle?: string;
  publishedAt?: string;
  publishedAtRaw?: string;
  caption?: string;
  tagNames?: string[];
  metrics?: {
    views?: number;
    profileViews?: number;
    viewers?: number;
    follows?: number;
    likes?: number;
    replies?: number;
    shares?: number;
    quotes?: number;
    reposts?: number;
    rates?: ThreadsPostInsights['rates'];
    trafficSources?: ThreadsPostInsights['trafficSources'];
    benchmarks?: ThreadsPostInsights['benchmarks'];
  };
}

export interface ThreadsCapturePayload {
  captureType?: string;
  schemaVersion?: number;
  captureMode?: 'overview' | 'single-post-detail' | 'mixed';
  pageText?: string;
  posts?: ThreadsCapturePost[];
  capturedAt?: string;
  sourceUrl?: string;
  title?: string;
}

function buildThreadsContent(post: ThreadsCapturePost, index: number, fallbackCapturedAt?: string, fallbackSourceUrl?: string): SocialContent | null {
  const rawText = cleanThreadsText(`${post.href ?? ''}\n${post.context ?? ''}`);
  const url = post.href || threadsPostUrl(rawText);
  const native = post.nativeContentId || url.match(/\/post\/([^/?#]+)/i)?.[1] || `capture-${index}-${Math.abs(hashText(rawText))}`;
  const metrics = post.metrics ?? {};

  const views = metrics.views ?? labeledNumber(rawText, '瀏覽次數') ?? labeledNumber(rawText, '觀看次數') ?? parseLooseMetric(rawText, ['Views']);
  const profileViews = metrics.profileViews ?? labeledNumber(rawText, '個人檔案瀏覽次數');
  const viewers = metrics.viewers ?? labeledNumber(rawText, '瀏覽人數');
  const follows = metrics.follows ?? labeledNumber(rawText, '追蹤次數');
  const likes = metrics.likes ?? labeledNumber(rawText, '按讚數') ?? parseLooseMetric(rawText, ['Likes']);
  const comments = metrics.replies ?? labeledNumber(rawText, '回覆數') ?? parseLooseMetric(rawText, ['Replies']);
  const directShares = metrics.shares ?? labeledNumber(rawText, '分享數') ?? parseLooseMetric(rawText, ['Shares']);
  const quotes = metrics.quotes ?? labeledNumber(rawText, '引用數') ?? parseLooseMetric(rawText, ['Quotes']);
  const reposts = metrics.reposts ?? labeledNumber(rawText, '轉發數') ?? parseLooseMetric(rawText, ['Reposts']);

  const rates: NonNullable<ThreadsPostInsights['rates']> = {
    like: metrics.rates?.like ?? labeledNumber(rawText, '按讚率', true),
    reply: metrics.rates?.reply ?? labeledNumber(rawText, '回覆率', true),
    share: metrics.rates?.share ?? labeledNumber(rawText, '分享率', true),
    quote: metrics.rates?.quote ?? labeledNumber(rawText, '引用率', true),
    repost: metrics.rates?.repost ?? labeledNumber(rawText, '轉發率', true),
  };
  const trafficSources: NonNullable<ThreadsPostInsights['trafficSources']> = {
    home: metrics.trafficSources?.home ?? sectionPercent(rawText, '瀏覽次數主要來源', '首頁'),
    search: metrics.trafficSources?.search ?? sectionPercent(rawText, '瀏覽次數主要來源', '搜尋'),
    profile: metrics.trafficSources?.profile ?? sectionPercent(rawText, '瀏覽次數主要來源', '個人檔案'),
    activityTab: metrics.trafficSources?.activityTab ?? sectionPercent(rawText, '瀏覽次數主要來源', '活動頁籤'),
  };
  const benchmarks: NonNullable<ThreadsPostInsights['benchmarks']> = {
    views: metrics.benchmarks?.views ?? benchmarkAfter(rawText, '瀏覽次數'),
    profileViews: metrics.benchmarks?.profileViews ?? benchmarkAfter(rawText, '個人檔案瀏覽次數'),
    viewers: metrics.benchmarks?.viewers ?? benchmarkAfter(rawText, '瀏覽人數'),
    follows: metrics.benchmarks?.follows ?? benchmarkAfter(rawText, '追蹤次數'),
    likeRate: metrics.benchmarks?.likeRate ?? benchmarkAfter(rawText, '按讚率'),
    replyRate: metrics.benchmarks?.replyRate ?? benchmarkAfter(rawText, '回覆率'),
    shareRate: metrics.benchmarks?.shareRate ?? benchmarkAfter(rawText, '分享率'),
    quoteRate: metrics.benchmarks?.quoteRate ?? benchmarkAfter(rawText, '引用率'),
    repostRate: metrics.benchmarks?.repostRate ?? benchmarkAfter(rawText, '轉發率'),
  };

  const caption = (post.caption || threadsCaptionFromText(rawText)).trim();
  if (!url && !caption && views === undefined && viewers === undefined) return null;
  const tagNames = [...new Set([...(post.tagNames ?? []), ...hashtags(rawText).map((x) => x.replace(/^#/, ''))].filter(Boolean))];
  const title = (tagNames[0] || firstLine(caption) || `Threads 內容 ${index + 1}`).slice(0, 180);
  const explicitDate = post.publishedAt || post.publishedAtRaw || rawText.match(/20\d{2}[/.-]\d{1,2}[/.-]\d{1,2}/)?.[0];
  const publishedAt = resolveDate(explicitDate) || resolveDate(fallbackCapturedAt) || new Date().toISOString().slice(0, 10);
  const hasCountEngagement = [likes, comments, directShares, quotes, reposts].some((value) => Number(value || 0) > 0);
  const engagement = Number(likes || 0) + Number(comments || 0) + Number(directShares || 0) + Number(quotes || 0) + Number(reposts || 0);
  const accountHandle = post.accountHandle || url.match(/threads\.com\/@([^/]+)/i)?.[1];

  return {
    id: `threads-${native}`,
    nativeContentId: native,
    platform: 'Threads', type: 'Threads Post', title, caption: caption || rawText,
    publishedAt, publishedAtRaw: post.publishedAtRaw || post.publishedAt || publishedAt,
    views: Number(views || 0), reach: 0, impressions: 0, engagement,
    likes: Number(likes || 0), comments: Number(comments || 0), shares: Number(directShares || 0) + Number(quotes || 0) + Number(reposts || 0),
    saves: 0, clicks: 0, messages: 0, conversationCount: 0,
    campaignId: 'unassigned', campaignName: '尚未歸類', confidence: 'low', reviewStatus: 'suggested',
    url, permalink: url || null, hashtags: [...new Set([...hashtags(caption), ...tagNames.map((x) => `#${x}`)])], classificationReasons: [],
    metricAvailability: { views: views !== undefined, reach: false, impressions: false, engagement: hasCountEngagement },
    sourceMetricNotes: [
      'Threads 單篇洞察：瀏覽次數使用 Threads 顯示值。',
      viewers !== undefined ? '「瀏覽人數」獨立保存在 Threads 洞察欄位，不冒充 Meta Reach。' : '此頁未取得 Threads 瀏覽人數。',
      hasCountEngagement ? '互動使用頁面提供的按讚／回覆／分享／引用／轉發計數。' : '頁面目前只提供互動率，未用百分比反推互動人數。',
    ],
    threadsInsights: {
      viewers, profileViews, follows, rates, trafficSources, benchmarks,
      capturedAt: fallbackCapturedAt, sourceUrl: fallbackSourceUrl, accountHandle, tagNames,
    },
  };
}

/** Parses the structured payload sent by the Chrome Threads Insights capture extension. */
export function parseThreadsCapturePayload(payload: ThreadsCapturePayload): { contents: SocialContent[]; warnings: string[] } {
  const contents = (payload.posts ?? []).map((post, index) => buildThreadsContent(post, index, payload.capturedAt, payload.sourceUrl)).filter((x): x is SocialContent => Boolean(x));
  if (!contents.length && payload.pageText) return parseThreadsInsightsText(payload.pageText);
  const detailed = contents.filter((item) => item.threadsInsights && (item.threadsInsights.viewers !== undefined || Object.values(item.threadsInsights.rates ?? {}).some((v) => v !== undefined))).length;
  return {
    contents,
    warnings: contents.length
      ? [`已接收 ${contents.length} 則 Threads 內容，其中 ${detailed} 則含單篇詳細洞察。`, 'Threads「瀏覽人數」與 FB/IG Reach 定義不同，系統分開保存；互動率也不會被反推成互動人數。']
      : ['沒有辨識到 Threads 貼文洞察。請在 Threads 的單篇洞察頁按擷取。'],
  };
}

/** Text fallback for pasted / saved Threads Insights page text. */
export function parseThreadsInsightsText(text: string): { contents: SocialContent[]; warnings: string[] } {
  const normalized = cleanThreadsText(text);
  if (!normalized) return { contents: [], warnings: ['尚未貼上 Threads 洞察內容。'] };

  // A single-post detail page contains one post permalink plus sections such as 摘要 / 瀏覽次數主要來源.
  const postUrls = [...normalized.matchAll(/https?:\/\/(?:www\.)?threads\.com\/@[^/\s]+\/post\/[^\s?#)]+/gi)];
  let blocks: string[] = [];
  if (postUrls.length > 1) {
    blocks = postUrls.map((match, i) => normalized.slice(match.index ?? 0, postUrls[i + 1]?.index ?? normalized.length).trim());
  } else {
    blocks = [normalized];
  }

  const contents = blocks.map((block, index) => buildThreadsContent({ href: threadsPostUrl(block), context: block }, index)).filter((x): x is SocialContent => Boolean(x));
  const warnings = contents.length
    ? [`已從 Threads 洞察文字辨識 ${contents.length} 則內容；單篇頁的瀏覽人數、追蹤、互動率與流量來源會另行保存。`, '互動率只保存百分比，不會拿百分比推算按讚／回覆實際人數。']
    : ['沒有從文字辨識出 Threads 內容。建議改用 Chrome 擷取器直接讀單篇洞察頁。'];
  return { contents, warnings };
}

function hashText(value: string) { let h=0; for(let i=0;i<value.length;i++) h=((h<<5)-h)+value.charCodeAt(i)|0; return h; }

/** One blank-line-separated block = one citizen conversation. Ten lines in one block = 1 conversation, 10 messages. */
export function parseMessengerConversationText(text: string): Interaction[] {
  const blocks = text.replace(/\r/g, '').split(/\n\s*\n|\n-{3,}\n/).map((x) => x.trim()).filter(Boolean);
  return blocks.map((block, index) => {
    const lines = block.split('\n').map((x) => x.trim()).filter(Boolean);
    const dateText = block.match(/20\d{2}[/.\-]\d{1,2}[/.\-]\d{1,2}|\d{1,2}\/\d{1,2}\/20\d{2}/)?.[0];
    return {
      id: `messenger-paste-${Date.now()}-${index}-${Math.abs(hashText(block))}`,
      source: 'Messenger 手動貼上', platform: 'Facebook', text: block,
      createdAt: resolveDate(dateText) || new Date().toISOString().slice(0, 10), campaignId: null, manualCampaignId: null,
      topic: '其他', suggestedTopic: '其他', manualTopic: null, confidence: 'low', reviewStatus: 'suggested',
      anonymousConversationId: `manual-${Math.abs(hashText(block)).toString(36)}`, conversationCount: 1, messageCount: Math.max(1, lines.length),
    };
  });
}
