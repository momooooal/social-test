import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const srcDir = path.join(repoRoot, 'artifacts/social-impact-dashboard/src/lib');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'social-impact-core-'));

for (const name of ['workspace-types.ts', 'classifier.ts', 'campaign-discovery.ts', 'merge.ts', 'analytics.ts', 'importer.ts']) {
  const source = fs.readFileSync(path.join(srcDir, name), 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
    fileName: name,
  }).outputText;
  fs.writeFileSync(path.join(tempDir, name.replace(/\.ts$/, '.js')), output);
}

const merge = require(path.join(tempDir, 'merge.js'));
const analytics = require(path.join(tempDir, 'analytics.js'));
const classifier = require(path.join(tempDir, 'classifier.js'));
const importer = require(path.join(tempDir, 'importer.js'));

const base = {
  generatedAt: '2026-08-31T00:00:00Z', isDemo: false,
  campaigns: [{ id: 'c1', name: '創意造筏', startDate: '2026-09-01', endDate: '2026-09-10', promotionStartDate: '2026-08-01', promotionEndDate: '2026-09-10', keywords: ['大港橋', '小小造船師'] }],
  monthlyMetrics: [{ month: '2026-08', views: 10, reach: 8, engagement: 1, messages: 0, followers: 100 }],
  platforms: [
    { platform: 'Facebook', followers: 100, growth: 1, views: 10, reach: 8, engagement: 1, posts: 1, reels: 0, stories: 0, messages: 0 },
    { platform: 'Instagram', followers: 50, growth: 1, views: 5, reach: 4, engagement: 1, posts: 1, reels: 0, stories: 0, messages: 0 },
  ],
  interactions: [{ id: 'i1', source: 'Facebook', text: '請問附近有停車場嗎？', createdAt: '2026-08-20', campaignId: 'c1', manualCampaignId: 'c1', topic: '報名方式', manualTopic: '停車', confidence: 'high', reviewStatus: 'reassigned', conversationCount: 1, messageCount: 3 }],
  contents: [{ id: 'p1', nativeContentId: 'n1', platform: 'Facebook', type: 'Post', title: '大港橋 小小造船師', caption: '活動開始', publishedAt: '2026-08-20', views: 100, reach: 80, engagement: 10, likes: 5, comments: 2, shares: 3, saves: 0, clicks: 0, messages: 0, campaignId: 'c1', manualCampaignId: 'c1', campaignName: '創意造筏', confidence: 'high', reviewStatus: 'reassigned', url: 'https://facebook.com/p/n1?utm_source=test' }],
};

const incoming = {
  contents: [{ ...base.contents[0], id: 'remote-id', views: 150, reach: 110, reviewStatus: 'suggested', manualCampaignId: null, campaignId: 'unassigned', url: 'https://facebook.com/p/n1' }],
  interactions: [{ ...base.interactions[0], campaignId: 'remote-campaign', manualCampaignId: null, manualTopic: null, reviewStatus: 'suggested' }],
  monthlyMetrics: [{ month: '2026-09', views: 20, reach: 15, engagement: 2, messages: 1, followers: 110 }],
  platforms: [{ platform: 'Facebook', followers: 110, growth: 10, views: 20, reach: 15, engagement: 2, posts: 2, reels: 0, stories: 0, messages: 1 }],
};

const merged = merge.mergeWorkspaceData(base, incoming, [], 'facebook-api');
assert.equal(merged.data.contents.length, 1, 'duplicate content should merge');
assert.equal(merged.data.contents[0].views, 150, 'remote metrics should update');
assert.equal(merged.data.contents[0].reviewStatus, 'reassigned', 'manual content review must survive sync');
assert.equal(merged.data.contents[0].manualCampaignId, 'c1', 'manual campaign must survive sync');
assert.equal(merged.data.interactions[0].manualCampaignId, 'c1', 'manual inquiry campaign must survive sync');
assert.equal(merged.data.interactions[0].manualTopic, '停車', 'manual inquiry topic must survive sync');
assert.equal(merged.data.monthlyMetrics.length, 2, 'monthly import must merge, not replace all months');
assert.equal(merged.data.platforms.length, 2, 'platform import must merge, not delete other platforms');
assert.equal(merged.snapshots.length, 2, 'first changed update should keep baseline + latest snapshot');
assert.equal(analytics.calculateCampaignMetrics(merged.data, merged.data.campaigns[0]).reach, 110, 'campaign KPI should recompute from content');


const mirroredFacebook = { ...base.contents[0], id: 'fb-cross', nativeContentId: 'fb-native', platform: 'Facebook', publishedAt: '2026-08-20T10:00:00Z', title: '同一波活動宣傳', caption: '同一波活動宣傳內容，這是一段足夠長而且會在 Facebook 與 Instagram 同步發布的完整活動文案 #活動', metricAvailability: { views: false, reach: false, engagement: true } };
const mirroredInstagram = { ...base.contents[0], id: 'ig-cross', nativeContentId: 'ig-native', platform: 'Instagram', publishedAt: '2026-08-20T10:01:00Z', title: '同一波活動宣傳', caption: '同一波活動宣傳內容，這是一段足夠長而且會在 Facebook 與 Instagram 同步發布的完整活動文案 #活動', views: 999, reach: 700, metricAvailability: { views: true, reach: true, engagement: true } };
assert.notEqual(merge.stableContentKey(mirroredFacebook), merge.stableContentKey(mirroredInstagram), 'same creative on FB and IG must remain two platform records');
const cross = analytics.crossPublishedGroups([mirroredFacebook, mirroredInstagram]);
assert.equal(cross.length, 1, 'mirrored FB+IG content should form a cross-published group');
assert.deepEqual(new Set(cross[0].platforms), new Set(['Facebook','Instagram']));
assert.equal(analytics.metricDisplay(mirroredFacebook, 'views').available, false, 'missing FB export views must be marked unavailable, not interpreted as zero performance');

const classification = classifier.classifyContent({ ...base.contents[0], campaignId: 'unassigned', manualCampaignId: null, reviewStatus: 'suggested' }, base.campaigns);
assert.equal(classification.campaignId, 'c1');
assert.ok(classification.score >= 4);
assert.equal(classifier.classifyInquiry('請問附近有停車場嗎？').topic, '停車');

const imported = importer.normalizeImportedContent({ 平台: 'Instagram', 貼文內容: '測試 Reel', 發布時間: '2026/09/01', 觀看次數: '1,234', 觸及人數: '900', 內容互動: '88', 貼文ID: 'ig999', 內容類型: 'Reel' }, 0);
assert.ok(imported.content);
assert.equal(imported.content.platform, 'Instagram');
assert.equal(imported.content.views, 1234);
assert.equal(imported.content.reach, 900);
assert.equal(imported.content.type, 'Reel');
assert.equal(importer.detectImportKind([{ 月份: '2026-09', 觸及: '1000', 追蹤者: '300' }]), 'monthlyMetrics');


const threadsParsed = importer.parseThreadsInsightsText(`https://www.threads.com/@demo/post/ABC123
霹靂舞活動貼文
Views 12,345
Likes 321
Replies 22
Reposts 18
Quotes 4`);
assert.equal(threadsParsed.contents.length, 1, 'threads.com insights capture text should parse');
assert.equal(threadsParsed.contents[0].views, 12345);
assert.equal(threadsParsed.contents[0].shares, 22, 'Threads reposts + quotes should map to distribution/share');
assert.equal(threadsParsed.contents[0].metricAvailability?.reach, false, 'Threads web fallback must not invent reach');

const fbViewsImport = importer.normalizeMetaContentExport([{ 貼文編號:'fb1', 粉絲專頁編號:'page1', 粉絲專頁名稱:'測試', 標題:'測試影片', 說明:'測試影片', 發佈時間:'09/01/2026 10:00', 永久連結:'https://facebook.com/reel/1', 貼文類型:'影片', 日期:'09/01/2026', 瀏覽次數:'1,234', 觸及人數:'900', '心情、留言和分享次數':'20' }]);
assert.ok(fbViewsImport && fbViewsImport.contents.length === 1, 'Facebook Meta export with views should parse');
assert.equal(fbViewsImport.contents[0].views, 1234);
assert.equal(fbViewsImport.contents[0].metricAvailability?.views, true);

const threadsSample = `kaohsiung_sports_development
https://www.threads.com/@kaohsiung_sports_development
2026高雄霹靂舞國際大賽
https://www.threads.com/search?q=2026%E9%AB%98%E9%9B%84%E9%9C%B9%E9%9D%82%E8%88%9E%E5%9C%8B%E9%9A%9B%E5%A4%A7%E8%B3%BD&serp_type=tags&tag_id=18407384482094034
1天
https://www.threads.com/@kaohsiung_sports_development/post/Dcq3XxGEyaV
🔥 2026高雄霹靂舞國際大賽｜圓滿落幕！🔥 兩天的精彩對決
摘要
瀏覽次數
230較低
個人檔案瀏覽次數
0較低
瀏覽人數
197較低
追蹤次數
0一般
影響瀏覽次數的因素
按讚率
3.48%高於
回覆率
0.87%高於
分享率
0%一般
引用率
0%一般
轉發率
0.43%高於
瀏覽次數主要來源
首頁
63.91%
搜尋
29.57%
個人檔案
5.22%
活動頁籤
1.3%`;
const threadsDetailParsed = importer.parseThreadsInsightsText(threadsSample);
assert.equal(threadsDetailParsed.contents.length, 1, 'Threads single-post insight should parse as one content');
assert.equal(threadsDetailParsed.contents[0].nativeContentId, 'Dcq3XxGEyaV');
assert.equal(threadsDetailParsed.contents[0].views, 230);
assert.equal(threadsDetailParsed.contents[0].threadsInsights.viewers, 197);
assert.equal(threadsDetailParsed.contents[0].threadsInsights.rates.like, 3.48);
assert.equal(threadsDetailParsed.contents[0].threadsInsights.rates.repost, 0.43);
assert.equal(threadsDetailParsed.contents[0].threadsInsights.trafficSources.search, 29.57);
assert.equal(threadsDetailParsed.contents[0].metricAvailability.engagement, false, 'rates must not be converted into fake interaction counts');
assert.equal(analytics.peopleMetricValue(threadsDetailParsed.contents[0]), 197, 'Threads viewers should feed people-type analysis without pretending to be Reach');
const structuredThreads = importer.parseThreadsCapturePayload({captureType:'threads-insights-capture',schemaVersion:3,captureMode:'single-post-detail',capturedAt:'2026-09-01T06:00:00Z',sourceUrl:'https://www.threads.com/insights?hl=zh-tw',posts:[{href:'https://www.threads.com/@kaohsiung_sports_development/post/Dcq3XxGEyaV',nativeContentId:'Dcq3XxGEyaV',accountHandle:'kaohsiung_sports_development',publishedAt:'2026-08-31T06:00:00Z',caption:'🔥 2026高雄霹靂舞國際大賽｜圓滿落幕！🔥',tagNames:['2026高雄霹靂舞國際大賽'],metrics:{views:230,profileViews:0,viewers:197,follows:0,rates:{like:3.48,reply:.87,share:0,quote:0,repost:.43},trafficSources:{home:63.91,search:29.57,profile:5.22,activityTab:1.3}}}]});
assert.equal(structuredThreads.contents[0].title, '2026高雄霹靂舞國際大賽');
assert.equal(structuredThreads.contents[0].threadsInsights.trafficSources.home, 63.91);

console.log('social-impact core regression checks: PASS');
