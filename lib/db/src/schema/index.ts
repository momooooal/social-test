import { boolean, integer, jsonb, pgTable, real, serial, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';

export const socialAccounts = pgTable('social_accounts', {
  id: text('id').primaryKey(),
  platform: text('platform').notNull(),
  accountName: text('account_name').notNull(),
  nativeAccountId: text('native_account_id'),
  status: text('status').notNull().default('unavailable'),
  lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const campaigns = pgTable('campaigns', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  summary: text('summary').notNull().default(''),
  startDate: text('start_date').notNull(),
  endDate: text('end_date').notNull(),
  promotionStartDate: text('promotion_start_date'),
  promotionEndDate: text('promotion_end_date'),
  keywords: jsonb('keywords').$type<string[]>().notNull().default([]),
  hashtags: jsonb('hashtags').$type<string[]>().notNull().default([]),
  aliases: jsonb('aliases').$type<string[]>().notNull().default([]),
  landingUrls: jsonb('landing_urls').$type<string[]>().notNull().default([]),
  archived: boolean('archived').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const contents = pgTable('social_contents', {
  id: text('id').primaryKey(),
  stableKey: text('stable_key').notNull(),
  platform: text('platform').notNull(),
  nativeContentId: text('native_content_id'),
  type: text('type').notNull(),
  title: text('title').notNull(),
  caption: text('caption'),
  publishedAt: timestamp('published_at', { withTimezone: true }).notNull(),
  permalink: text('permalink'),
  url: text('url').notNull().default(''),
  views: integer('views').notNull().default(0),
  impressions: integer('impressions').notNull().default(0),
  reach: integer('reach').notNull().default(0),
  engagement: integer('engagement').notNull().default(0),
  likes: integer('likes').notNull().default(0),
  comments: integer('comments').notNull().default(0),
  shares: integer('shares').notNull().default(0),
  saves: integer('saves').notNull().default(0),
  clicks: integer('clicks').notNull().default(0),
  messages: integer('messages').notNull().default(0),
  conversationCount: integer('conversation_count').notNull().default(0),
  suggestedCampaignId: text('suggested_campaign_id'),
  classificationScore: real('classification_score').notNull().default(0),
  classificationReasons: jsonb('classification_reasons').$type<string[]>().notNull().default([]),
  confidence: text('confidence').notNull().default('low'),
  lastSource: text('last_source').notNull().default('manual-json'),
  lastUpdatedAt: timestamp('last_updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({ stableKeyUnique: uniqueIndex('social_contents_stable_key_unique').on(table.stableKey) }));

export const contentSnapshots = pgTable('content_snapshots', {
  id: text('id').primaryKey(),
  contentId: text('content_id').notNull(),
  stableKey: text('stable_key').notNull(),
  platform: text('platform').notNull(),
  capturedAt: timestamp('captured_at', { withTimezone: true }).notNull(),
  views: integer('views').notNull().default(0),
  impressions: integer('impressions').notNull().default(0),
  reach: integer('reach').notNull().default(0),
  engagement: integer('engagement').notNull().default(0),
  likes: integer('likes').notNull().default(0),
  comments: integer('comments').notNull().default(0),
  shares: integer('shares').notNull().default(0),
  saves: integer('saves').notNull().default(0),
  clicks: integer('clicks').notNull().default(0),
  messages: integer('messages').notNull().default(0),
  conversationCount: integer('conversation_count').notNull().default(0),
  source: text('source').notNull(),
});

export const manualReviews = pgTable('manual_reviews', {
  id: serial('id').primaryKey(),
  contentId: text('content_id').notNull(),
  manualCampaignId: text('manual_campaign_id'),
  reviewStatus: text('review_status').notNull(),
  reason: text('reason'),
  reviewSource: text('review_source').notNull().default('manual'),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }).defaultNow().notNull(),
});

export const interactions = pgTable('interactions', {
  id: text('id').primaryKey(),
  anonymousConversationId: text('anonymous_conversation_id'),
  source: text('source').notNull(),
  platform: text('platform'),
  contentId: text('content_id'),
  campaignId: text('campaign_id'),
  text: text('text'),
  topic: text('topic').notNull().default('其他'),
  suggestedTopic: text('suggested_topic'),
  confidence: text('confidence').notNull().default('low'),
  conversationCount: integer('conversation_count').notNull().default(1),
  messageCount: integer('message_count').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
});

export const interactionReviews = pgTable('interaction_reviews', {
  id: serial('id').primaryKey(),
  interactionId: text('interaction_id').notNull(),
  manualTopic: text('manual_topic'),
  campaignId: text('campaign_id'),
  reviewStatus: text('review_status').notNull(),
  excluded: boolean('excluded').notNull().default(false),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }).defaultNow().notNull(),
});

export const monthlyMetrics = pgTable('monthly_metrics', {
  id: serial('id').primaryKey(),
  period: text('period').notNull(),
  platform: text('platform').notNull().default('all'),
  views: integer('views').notNull().default(0),
  reach: integer('reach').notNull().default(0),
  engagement: integer('engagement').notNull().default(0),
  messages: integer('messages').notNull().default(0),
  followers: integer('followers').notNull().default(0),
  source: text('source').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const platformMetrics = pgTable('platform_metrics', {
  id: serial('id').primaryKey(),
  platform: text('platform').notNull(),
  capturedAt: timestamp('captured_at', { withTimezone: true }).defaultNow().notNull(),
  followers: integer('followers').notNull().default(0),
  growth: real('growth').notNull().default(0),
  views: integer('views').notNull().default(0),
  reach: integer('reach').notNull().default(0),
  engagement: integer('engagement').notNull().default(0),
  posts: integer('posts').notNull().default(0),
  reels: integer('reels').notNull().default(0),
  stories: integer('stories').notNull().default(0),
  messages: integer('messages').notNull().default(0),
  source: text('source').notNull(),
});

export const syncRuns = pgTable('sync_runs', {
  id: serial('id').primaryKey(),
  source: text('source').notNull(),
  status: text('status').notNull(),
  imported: integer('imported').notNull().default(0),
  warning: text('warning'),
  startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
});

export const syncSources = pgTable('sync_sources', {
  id: text('id').primaryKey(),
  label: text('label').notNull(),
  status: text('status').notNull(),
  lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
  detail: text('detail'),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
});
