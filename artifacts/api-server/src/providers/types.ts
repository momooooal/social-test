export type Platform = 'Facebook' | 'Instagram' | 'Threads';

export interface NormalizedContent {
  id: string;
  nativeContentId?: string | null;
  platform: Platform;
  type: 'Post' | 'Reel' | 'Story' | 'Threads Post';
  title: string;
  caption?: string | null;
  publishedAt: string;
  views: number;
  impressions?: number;
  reach: number;
  engagement: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  clicks: number;
  messages: number;
  conversationCount?: number;
  campaignId: string;
  campaignName: string;
  confidence: 'high' | 'medium' | 'low';
  reviewStatus: 'suggested' | 'accepted' | 'reassigned' | 'excluded';
  url: string;
  permalink?: string | null;
  hashtags?: string[];
  suggestedCampaignId?: string | null;
  classificationScore?: number;
  classificationReasons?: string[];
  lastSource?: string;
  lastUpdatedAt?: string;
}

export interface ProviderResult {
  platform: Platform;
  contents: NormalizedContent[];
  account?: { followers?: number; reach?: number; views?: number; engagement?: number };
  warnings: string[];
}
