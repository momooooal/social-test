export type PlatformName = 'Facebook' | 'Instagram' | 'Threads' | string;
export type ContentType = 'Post' | 'Reel' | 'Story' | 'Video' | 'Live' | 'Threads Post' | string;
export type Confidence = 'high' | 'medium' | 'low';
export type ReviewStatus = 'suggested' | 'accepted' | 'reassigned' | 'excluded';
export type DataSource = 'demo' | 'manual-csv' | 'manual-xlsx' | 'manual-json' | 'facebook-api' | 'instagram-api' | 'threads-api' | 'backend' | string;

export interface MonthlyMetric {
  month: string;
  views: number;
  reach: number;
  engagement: number;
  messages: number;
  followers: number;
}

export interface PlatformMetric {
  platform: string;
  followers: number;
  growth: number;
  views: number;
  reach: number;
  engagement: number;
  posts: number;
  reels: number;
  stories: number;
  messages: number;
}

export interface Campaign {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  contentCount?: number;
  views?: number;
  reach?: number;
  engagement?: number;
  messages?: number;
  topQuestion?: string;
  summary?: string;
  archived?: boolean;
  keywords?: string[];
  hashtags?: string[];
  aliases?: string[];
  landingUrls?: string[];
  promotionStartDate?: string;
  promotionEndDate?: string;
  goal?: string;
}

export interface SocialContent {
  id: string;
  platform: PlatformName;
  type: ContentType;
  title: string;
  publishedAt: string;
  views: number;
  reach: number;
  engagement: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  clicks: number;
  messages: number;
  campaignId?: string | null;
  campaignName?: string | null;
  confidence: Confidence;
  reviewStatus: ReviewStatus;
  url?: string | null;
  nativeContentId?: string | null;
  caption?: string | null;
  hashtags?: string[];
  permalink?: string | null;
  impressions?: number;
  conversationCount?: number;
  suggestedCampaignId?: string | null;
  classificationScore?: number;
  classificationReasons?: string[];
  manualCampaignId?: string | null;
  reviewedAt?: string | null;
  reviewSource?: string | null;
  stableKey?: string;
  lastSource?: DataSource;
  lastUpdatedAt?: string;
}

export interface Interaction {
  id: string;
  source: string;
  text: string;
  createdAt: string;
  campaignId?: string | null;
  manualCampaignId?: string | null;
  topic: string;
  confidence: Confidence;
  anonymousConversationId?: string | null;
  platform?: string | null;
  contentId?: string | null;
  conversationCount?: number;
  messageCount?: number;
  suggestedTopic?: string | null;
  manualTopic?: string | null;
  reviewStatus?: ReviewStatus;
  excluded?: boolean;
  reviewedAt?: string | null;
}

export interface WorkspaceData {
  generatedAt: string;
  isDemo: boolean;
  monthlyMetrics: MonthlyMetric[];
  contents: SocialContent[];
  campaigns: Campaign[];
  interactions: Interaction[];
  platforms: PlatformMetric[];
  metadata?: Record<string, unknown>;
}

export interface ContentSnapshot {
  id: string;
  contentId: string;
  stableKey: string;
  platform: string;
  capturedAt: string;
  views: number;
  reach: number;
  impressions: number;
  engagement: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  clicks: number;
  messages: number;
  conversationCount: number;
  source: DataSource;
}

export interface MergeSummary {
  added: number;
  updated: number;
  unchanged: number;
  snapshotsAdded: number;
}

export interface ImportPreview {
  source: DataSource;
  fileName: string;
  dataType: 'contents' | 'backup';
  rows: SocialContent[];
  previewRows: string[][];
  recognized: number;
  unrecognized: number;
  warnings: string[];
}

export function asWorkspaceData(data: WorkspaceData): WorkspaceData {
  return data;
}
