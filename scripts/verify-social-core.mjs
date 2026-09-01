import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const srcDir = path.join(repoRoot, 'artifacts/social-impact-dashboard/src/lib');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'social-impact-core-'));

for (const name of ['workspace-types.ts', 'classifier.ts', 'merge.ts', 'analytics.ts', 'importer.ts']) {
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

console.log('social-impact core regression checks: PASS');
