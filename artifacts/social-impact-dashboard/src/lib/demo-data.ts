import type { Campaign, Interaction, SocialContent, WorkspaceData } from './workspace-types';

const monthlyMetrics = [
  ['Jan', 184200, 120800, 6840, 288, 12840],
  ['Feb', 196400, 128900, 7120, 304, 13010],
  ['Mar', 214800, 141600, 7840, 352, 13380],
  ['Apr', 207300, 136200, 7480, 338, 13620],
  ['May', 229700, 149800, 8310, 391, 13940],
  ['Jun', 246900, 161400, 9050, 438, 14320],
  ['Jul', 238500, 155900, 8760, 421, 14680],
  ['Aug', 261200, 170700, 9420, 466, 15090],
  ['Sep', 278400, 181900, 10180, 508, 15540],
  ['Oct', 289100, 189600, 10840, 536, 15880],
  ['Nov', 302700, 197400, 11460, 582, 16240],
  ['Dec', 316800, 206900, 12120, 621, 16720],
].map(([month, views, reach, engagement, messages, followers]) => ({
  month: String(month),
  views: Number(views),
  reach: Number(reach),
  engagement: Number(engagement),
  messages: Number(messages),
  followers: Number(followers),
}));

export const demoData: WorkspaceData = {
  generatedAt: '2025-01-08T09:30:00.000Z',
  isDemo: true,
  monthlyMetrics,
  contents: [
    { id: 'ct-01', platform: 'Instagram', type: 'Reel', title: '把公園還給每一個人｜社區共創日', publishedAt: '2024-12-18', views: 48200, reach: 31800, engagement: 3120, likes: 2480, comments: 184, shares: 302, saves: 154, clicks: 220, messages: 34, campaignId: 'cp-01', campaignName: '城市裡的綠色客廳', confidence: 'high', reviewStatus: 'accepted', url: 'https://instagram.com' },
    { id: 'ct-02', platform: 'Facebook', type: 'Post', title: '新住民服務地圖：一張卡就能找到資源', publishedAt: '2024-12-10', views: 39100, reach: 28200, engagement: 2680, likes: 1940, comments: 232, shares: 190, saves: 76, clicks: 516, messages: 88, campaignId: 'cp-02', campaignName: '一起生活指南', confidence: 'high', reviewStatus: 'accepted', url: 'https://facebook.com' },
    { id: 'ct-03', platform: 'Threads', type: 'Threads Post', title: '你希望下一個社區服務站在哪裡？', publishedAt: '2024-12-05', views: 22700, reach: 15800, engagement: 1840, likes: 1120, comments: 390, shares: 84, saves: 40, clicks: 182, messages: 71, campaignId: 'cp-03', campaignName: '問一個好問題', confidence: 'medium', reviewStatus: 'suggested', url: 'https://threads.net' },
    { id: 'ct-04', platform: 'Instagram', type: 'Story', title: '長者數位陪伴：志工的一天', publishedAt: '2024-11-28', views: 18400, reach: 12400, engagement: 1290, likes: 740, comments: 48, shares: 56, saves: 34, clicks: 338, messages: 26, campaignId: 'cp-04', campaignName: '不只是上網', confidence: 'high', reviewStatus: 'accepted', url: 'https://instagram.com' },
    { id: 'ct-05', platform: 'Facebook', type: 'Reel', title: '三分鐘看懂今年的托育支持', publishedAt: '2024-11-16', views: 55700, reach: 36600, engagement: 3940, likes: 3020, comments: 270, shares: 438, saves: 212, clicks: 694, messages: 42, campaignId: 'cp-02', campaignName: '一起生活指南', confidence: 'high', reviewStatus: 'accepted', url: 'https://facebook.com' },
    { id: 'ct-06', platform: 'Instagram', type: 'Post', title: '一盞燈、一張桌：夜間共學的故事', publishedAt: '2024-10-30', views: 26800, reach: 20100, engagement: 2190, likes: 1610, comments: 145, shares: 132, saves: 204, clicks: 182, messages: 24, campaignId: 'cp-01', campaignName: '城市裡的綠色客廳', confidence: 'medium', reviewStatus: 'reassigned', url: 'https://instagram.com' },
    { id: 'ct-07', platform: 'Threads', type: 'Threads Post', title: '把問題說給我們聽，下一次一起改', publishedAt: '2024-10-12', views: 16200, reach: 11200, engagement: 1540, likes: 920, comments: 366, shares: 68, saves: 22, clicks: 164, messages: 58, campaignId: 'cp-03', campaignName: '問一個好問題', confidence: 'low', reviewStatus: 'suggested', url: 'https://threads.net' },
    { id: 'ct-08', platform: 'Facebook', type: 'Post', title: '年度成果：每一次回覆都算數', publishedAt: '2024-09-26', views: 43100, reach: 30900, engagement: 2850, likes: 2140, comments: 186, shares: 252, saves: 64, clicks: 404, messages: 64, campaignId: 'cp-04', campaignName: '不只是上網', confidence: 'high', reviewStatus: 'accepted', url: 'https://facebook.com' },
  ],
  campaigns: [
    { id: 'cp-01', name: '城市裡的綠色客廳', startDate: '2024-03-01', endDate: '2024-12-31', contentCount: 28, views: 386200, reach: 248100, engagement: 24860, messages: 604, topQuestion: '附近還有哪裡可以參加？', summary: '以社區共創與公共空間為主題，累積最多跨平台分享。' },
    { id: 'cp-02', name: '一起生活指南', startDate: '2024-05-15', endDate: '2024-12-20', contentCount: 21, views: 341800, reach: 219600, engagement: 22140, messages: 582, topQuestion: '服務需要預約嗎？', summary: '把分散的生活支持轉成可保存、可轉傳的實用內容。' },
    { id: 'cp-03', name: '問一個好問題', startDate: '2024-07-01', endDate: '2024-11-30', contentCount: 17, views: 187400, reach: 126800, engagement: 15980, messages: 466, topQuestion: '我的意見會被看見嗎？', summary: '以 Threads 對話與公開提問建立持續的回饋入口。' },
    { id: 'cp-04', name: '不只是上網', startDate: '2024-02-01', endDate: '2024-10-31', contentCount: 24, views: 294600, reach: 190400, engagement: 18420, messages: 408, topQuestion: '可以帶家人一起來嗎？', summary: '用人物故事說明數位陪伴如何回到日常生活。' },
  ],
  interactions: [
    { id: 'iq-01', source: 'Facebook', text: '請問親子活動需要先報名嗎？', createdAt: '2024-12-20', campaignId: 'cp-02', topic: '活動參與', confidence: 'high' },
    { id: 'iq-02', source: 'Instagram', text: '附近的服務站週末也有開嗎？', createdAt: '2024-12-18', campaignId: 'cp-02', topic: '服務時間', confidence: 'high' },
    { id: 'iq-03', source: 'Threads', text: '我想提議把這個方法帶到我們里。', createdAt: '2024-12-13', campaignId: 'cp-03', topic: '意見回饋', confidence: 'medium' },
    { id: 'iq-04', source: 'Facebook', text: '長輩不會用手機也可以參加嗎？', createdAt: '2024-12-08', campaignId: 'cp-04', topic: '服務資格', confidence: 'high' },
    { id: 'iq-05', source: 'Instagram', text: '下次共創日會在哪個公園？', createdAt: '2024-11-30', campaignId: 'cp-01', topic: '活動地點', confidence: 'high' },
    { id: 'iq-06', source: 'Threads', text: '這個政策的資料可以下載嗎？', createdAt: '2024-11-28', campaignId: 'cp-03', topic: '資料取得', confidence: 'medium' },
    { id: 'iq-07', source: 'Facebook', text: '想加入志工，需要什麼條件？', createdAt: '2024-11-16', campaignId: 'cp-04', topic: '志工招募', confidence: 'high' },
    { id: 'iq-08', source: 'Instagram', text: '第一次來，有推薦的路線嗎？', createdAt: '2024-11-08', campaignId: 'cp-01', topic: '參與指引', confidence: 'low' },
  ],
  platforms: [
    { platform: 'Facebook', followers: 28400, growth: 12.4, views: 642800, reach: 421600, engagement: 48120, posts: 42, reels: 16, stories: 32, messages: 1224 },
    { platform: 'Instagram', followers: 19600, growth: 18.7, views: 589400, reach: 380200, engagement: 52640, posts: 34, reels: 28, stories: 48, messages: 906 },
    { platform: 'Threads', followers: 7200, growth: 31.2, views: 286600, reach: 191100, engagement: 31880, posts: 58, reels: 0, stories: 0, messages: 424 },
  ],
};

export const demoStatus = {
  mode: 'hybrid',
  sources: [
    { source: 'facebook', label: 'Facebook', status: 'healthy', lastSynced: '2025-01-08T09:22:00.000Z', detail: '42 posts synced' },
    { source: 'instagram', label: 'Instagram', status: 'healthy', lastSynced: '2025-01-08T09:21:00.000Z', detail: '110 items synced' },
    { source: 'threads', label: 'Threads', status: 'warning', lastSynced: '2025-01-07T18:40:00.000Z', detail: '2 items need review' },
  ],
};

const extraCampaigns: Campaign[] = [
  { id: 'cp-05', name: '2024 城市共好成果展', startDate: '2024-08-01', endDate: '2024-12-31', contentCount: 14, views: 224600, reach: 148300, engagement: 14380, messages: 312, topQuestion: '成果展需要報名嗎？', summary: '整理年度服務成果，讓社群看見政策如何回到日常。' },
];

const extraContents: SocialContent[] = Array.from({ length: 42 }, (_, index) => {
  const number = index + 9;
  const platform = (['Facebook', 'Instagram', 'Threads'] as const)[index % 3];
  const type = platform === 'Threads' ? 'Threads Post' : (['Post', 'Reel', 'Story'] as const)[index % 3];
  const campaign = [...demoData.campaigns, ...extraCampaigns][index % 5];
  const views = 16200 + ((index * 7193) % 61000);
  const reach = Math.round(views * (0.62 + (index % 5) * 0.035));
  const engagement = Math.round(reach * (0.045 + (index % 4) * 0.009));
  return {
    id: `ct-${String(number).padStart(2, '0')}`,
    platform,
    type,
    title: ['週末一起走進社區，看看新的服務角落', '從一個提問開始，讓服務更靠近', '把日常的需要說給我們聽', '一張圖看懂今年的社區行動'][index % 4],
    publishedAt: `2024-${String((index % 12) + 1).padStart(2, '0')}-${String((index % 24) + 1).padStart(2, '0')}`,
    views,
    reach,
    engagement,
    likes: Math.round(engagement * 0.75),
    comments: Math.round(engagement * 0.08),
    shares: Math.round(engagement * 0.06),
    saves: Math.round(engagement * 0.04),
    clicks: Math.round(engagement * 0.12),
    messages: 12 + (index % 8) * 7,
    campaignId: campaign.id,
    campaignName: campaign.name,
    confidence: index % 9 === 0 ? 'low' : index % 4 === 0 ? 'medium' : 'high',
    reviewStatus: index % 9 === 0 ? 'suggested' : index % 11 === 0 ? 'reassigned' : 'accepted',
    url: `https://${platform.toLowerCase()}.com`,
  };
});

demoData.campaigns = [...demoData.campaigns, ...extraCampaigns];
demoData.contents = [...demoData.contents, ...extraContents];
const extraInteractions: Interaction[] = Array.from({ length: 24 }, (_, index) => ({
  id: `iq-${String(index + 9).padStart(2, '0')}`,
  source: (['Facebook', 'Instagram', 'Threads'] as const)[index % 3],
  text: ['請問第一次參加需要先報名嗎？', '週末也有服務人員可以協助嗎？', '下次活動會在哪個地點舉辦？', '想知道成果展的開放時間。'][index % 4],
  createdAt: `2024-${String((index % 12) + 1).padStart(2, '0')}-${String((index % 24) + 1).padStart(2, '0')}`,
  campaignId: [...demoData.campaigns][index % 5].id,
  topic: ['活動參與', '服務時間', '意見回饋', '服務資格', '活動地點', '交通與停車'][index % 6],
  confidence: (index % 7 === 0 ? 'low' : index % 3 === 0 ? 'medium' : 'high') as Interaction['confidence'],
}));

demoData.interactions = [
  ...demoData.interactions,
  ...extraInteractions,
];