import type { Campaign, SocialContent } from './workspace-types';

function norm(value: string | null | undefined) {
  return (value ?? '').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}

function compact(value: string | null | undefined) { return norm(value).replace(/\s+/g, ''); }

function dateInside(date: string, start?: string, end?: string) {
  if (!date || !start || !end) return false;
  const d = date.slice(0, 10);
  return d >= start.slice(0, 10) && d <= end.slice(0, 10);
}

export interface ClassificationResult {
  campaignId: string | null;
  score: number;
  confidence: 'high' | 'medium' | 'low';
  reasons: string[];
}

export function classifyContent(content: SocialContent, campaigns: Campaign[]): ClassificationResult {
  const text = compact([content.title, content.caption, content.url, content.permalink, ...(content.hashtags ?? [])].filter(Boolean).join(' '));
  const headlineLines = (content.caption ?? '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean).slice(0, 5);
  const headline = compact([content.title, headlineLines.join(' ')].filter(Boolean).join(' '));
  let best: ClassificationResult = { campaignId: null, score: 0, confidence: 'low', reasons: [] };

  for (const campaign of campaigns.filter((item) => !item.archived)) {
    let score = 0;
    let semanticScore = 0;
    const reasons: string[] = [];
    const add = (points: number, reason: string) => { score += points; semanticScore += points; reasons.push(reason); };
    const name = compact(campaign.name);
    if (name && text.includes(name)) add(5, '活動名稱命中 +5');
    if (name && headline.includes(name)) add(4, '標題／文案前段命中活動名稱 +4');

    for (const alias of campaign.aliases ?? []) {
      const key = compact(alias);
      if (key && text.includes(key)) add(3, `別名「${alias}」命中 +3`);
      if (key && headline.includes(key)) add(2, `前段別名「${alias}」命中 +2`);
    }
    for (const hashtag of campaign.hashtags ?? []) {
      const key = compact(hashtag.replace(/^#/, ''));
      if (key && text.includes(key)) add(3, `#${key} 命中 +3`);
    }
    for (const keyword of campaign.keywords ?? []) {
      const key = compact(keyword);
      if (key && text.includes(key)) add(2, `關鍵字「${keyword}」命中 +2`);
      if (key && headline.includes(key) && key.length >= 4) add(1, `前段關鍵字「${keyword}」命中 +1`);
    }
    for (const url of campaign.landingUrls ?? []) {
      const key = compact(url);
      if (key && text.includes(key)) add(4, '活動網址命中 +4');
    }
    // Date is supporting evidence only. It must never classify an unrelated post by itself.
    const rangeStart = campaign.promotionStartDate ?? campaign.startDate;
    const rangeEnd = campaign.promotionEndDate ?? campaign.endDate;
    if (semanticScore > 0 && dateInside(content.publishedAt, rangeStart, rangeEnd)) { score += 2; reasons.push('發布日在宣傳期間 +2'); }

    if (semanticScore >= 2 && score > best.score) {
      best = { campaignId: campaign.id, score, confidence: score >= 9 ? 'high' : score >= 5 ? 'medium' : 'low', reasons };
    }
  }
  return best;
}

export const INQUIRY_TOPICS = [
  '報名方式', '名額 / 候補', '資格 / 參加對象', '時間 / 日期', '地點', '交通', '停車',
  '費用', '付款', '退費', '活動內容', '流程', '規則', '裝備', '服裝', '材料',
  '天候', '延期', '取消', '獎項', '成績', '證明', '其他',
] as const;

const TOPIC_RULES: Array<[string, RegExp]> = [
  ['名額 / 候補', /(候補|候位|額滿|名額|遞補)/i],
  ['報名方式', /(報名|登記|怎麼參加|如何參加|表單)/i],
  ['資格 / 參加對象', /(資格|幾歲|年齡|對象|可以參加|身分)/i],
  ['交通', /(捷運|公車|交通|怎麼去|搭車)/i],
  ['停車', /(停車|車位|機車|汽車)/i],
  ['時間 / 日期', /(幾點|時間|日期|哪天|星期|開始|結束)/i],
  ['地點', /(地點|地址|在哪|位置|場地)/i],
  ['費用', /(費用|多少錢|免費|收費|價錢)/i],
  ['付款', /(付款|繳費|匯款|刷卡)/i],
  ['退費', /(退費|退款|取消報名)/i],
  ['天候', /(下雨|天氣|颱風|高溫)/i],
  ['延期', /(延期|改期|延後)/i],
  ['取消', /(取消|停辦)/i],
  ['規則', /(規則|規定|限制|辦法)/i],
  ['裝備', /(裝備|器材|自備)/i],
  ['服裝', /(服裝|衣服|鞋|穿什麼)/i],
  ['材料', /(材料|材料包)/i],
  ['獎項', /(獎品|獎項|獎金)/i],
  ['成績', /(成績|排名|名次)/i],
  ['證明', /(證明|證書|時數)/i],
  ['流程', /(流程|報到|程序|步驟)/i],
  ['活動內容', /(內容|做什麼|活動是什麼|課程內容)/i],
];

export function classifyInquiry(text: string) {
  for (const [topic, rule] of TOPIC_RULES) if (rule.test(text)) return { topic, confidence: 'high' as const };
  return { topic: '其他', confidence: 'low' as const };
}

export function classifyInteractionCampaign(text: string, createdAt: string, campaigns: Campaign[]): ClassificationResult {
  const haystack = norm(text);
  let best: ClassificationResult = { campaignId: null, score: 0, confidence: 'low', reasons: [] };
  for (const campaign of campaigns.filter((item) => !item.archived)) {
    let score = 0;
    const reasons: string[] = [];
    const name = norm(campaign.name);
    if (name && haystack.includes(name)) { score += 5; reasons.push('活動名稱命中 +5'); }
    for (const alias of campaign.aliases ?? []) {
      const key = norm(alias); if (key && haystack.includes(key)) { score += 3; reasons.push(`活動別名「${alias}」命中 +3`); }
    }
    for (const keyword of campaign.keywords ?? []) {
      const key = norm(keyword); if (key && haystack.includes(key)) { score += 2; reasons.push(`關鍵字「${keyword}」命中 +2`); }
    }
    if (dateInside(createdAt, campaign.promotionStartDate ?? campaign.startDate, campaign.promotionEndDate ?? campaign.endDate)) {
      score += 1;
      reasons.push('詢問時間落在宣傳期間 +1');
    }
    if (score > best.score) best = { campaignId: campaign.id, score, confidence: score >= 7 ? 'high' : score >= 4 ? 'medium' : 'low', reasons };
  }
  return best;
}
