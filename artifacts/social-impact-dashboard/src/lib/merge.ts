import { classifyContent } from './classifier';
import type { Campaign, ContentSnapshot, DataSource, MergeSummary, SocialContent, WorkspaceData } from './workspace-types';

function normalizeUrl(url?: string | null) {
  if (!url) return '';
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    ['utm_source','utm_medium','utm_campaign','utm_content','fbclid'].forEach((key) => parsed.searchParams.delete(key));
    return `${parsed.origin}${parsed.pathname}${parsed.search}`.replace(/\/$/, '').toLowerCase();
  } catch {
    return url.trim().replace(/\/$/, '').toLowerCase();
  }
}

function simpleHash(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) { hash ^= value.charCodeAt(i); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0).toString(36);
}

export function stableContentKey(content: SocialContent) {
  const platform = content.platform.toLowerCase();
  if (content.nativeContentId) return `${platform}:native:${content.nativeContentId}`;
  const permalink = normalizeUrl(content.permalink || content.url);
  if (permalink) return `${platform}:url:${permalink}`;
  const caption = (content.caption || content.title || '').normalize('NFKC').trim().toLowerCase();
  return `${platform}:fallback:${content.publishedAt.slice(0, 16)}:${simpleHash(caption)}`;
}

const METRIC_KEYS = ['views','reach','impressions','engagement','likes','comments','shares','saves','clicks','messages','conversationCount'] as const;

export function snapshotFromContent(content: SocialContent, source: DataSource | string, capturedAt = new Date().toISOString()): ContentSnapshot {
  const key = stableContentKey(content);
  return {
    id: `${key}:${capturedAt}`,
    contentId: content.id,
    stableKey: key,
    platform: content.platform,
    capturedAt,
    views: Number(content.views || 0), reach: Number(content.reach || 0), impressions: Number(content.impressions || content.views || 0),
    engagement: Number(content.engagement || 0), likes: Number(content.likes || 0), comments: Number(content.comments || 0), shares: Number(content.shares || 0),
    saves: Number(content.saves || 0), clicks: Number(content.clicks || 0), messages: Number(content.messages || 0), conversationCount: Number(content.conversationCount || 0), source,
  };
}

function metricsChanged(content: SocialContent, latest?: ContentSnapshot) {
  if (!latest) return true;
  return METRIC_KEYS.some((key) => Number(content[key] ?? 0) !== Number(latest[key] ?? 0));
}

function applyClassification(content: SocialContent, campaigns: Campaign[]) {
  if (content.reviewStatus !== 'suggested' || content.manualCampaignId) return content;
  const result = classifyContent(content, campaigns);
  if (!result.campaignId) return content;
  const campaign = campaigns.find((item) => item.id === result.campaignId);
  return {
    ...content,
    suggestedCampaignId: result.campaignId,
    campaignId: content.campaignId && content.campaignId !== 'unassigned' ? content.campaignId : result.campaignId,
    campaignName: campaign?.name ?? content.campaignName,
    classificationScore: result.score,
    classificationReasons: result.reasons,
    confidence: result.confidence,
  };
}

function mergeOne(existing: SocialContent | undefined, incoming: SocialContent, source: DataSource | string, campaigns: Campaign[]) {
  const now = new Date().toISOString();
  const classified = applyClassification({ ...incoming, stableKey: stableContentKey(incoming), lastSource: source, lastUpdatedAt: now }, campaigns);
  if (!existing) return classified;

  // Remote/manual imports may update factual fields and metrics, but human review is authoritative.
  const preserved = {
    manualCampaignId: existing.manualCampaignId ?? null,
    reviewedAt: existing.reviewedAt ?? null,
    reviewSource: existing.reviewSource ?? null,
    reviewStatus: existing.reviewStatus,
  };
  const merged: SocialContent = { ...existing, ...classified, ...preserved, id: existing.id };
  if (preserved.manualCampaignId) {
    merged.campaignId = preserved.manualCampaignId;
    const campaign = campaigns.find((item) => item.id === preserved.manualCampaignId);
    if (campaign) merged.campaignName = campaign.name;
  } else if (preserved.reviewStatus === 'excluded') {
    merged.campaignId = existing.campaignId;
    merged.campaignName = existing.campaignName;
  }
  return merged;
}

export function mergeWorkspaceData(
  current: WorkspaceData,
  incoming: Partial<WorkspaceData>,
  snapshots: ContentSnapshot[],
  source: DataSource | string,
): { data: WorkspaceData; snapshots: ContentSnapshot[]; summary: MergeSummary } {
  const campaigns = incoming.campaigns?.length ? mergeCampaigns(current.campaigns, incoming.campaigns) : current.campaigns;
  const result = [...current.contents];
  const indexByKey = new Map<string, number>();
  result.forEach((content, index) => indexByKey.set(stableContentKey(content), index));

  const latestByKey = new Map<string, ContentSnapshot>();
  for (const snap of snapshots) {
    const previous = latestByKey.get(snap.stableKey);
    if (!previous || previous.capturedAt < snap.capturedAt) latestByKey.set(snap.stableKey, snap);
  }

  const summary: MergeSummary = { added: 0, updated: 0, unchanged: 0, snapshotsAdded: 0 };
  const nextSnapshots = [...snapshots];

  for (const raw of incoming.contents ?? []) {
    const key = stableContentKey(raw);
    const idx = indexByKey.get(key);
    const old = idx === undefined ? undefined : result[idx];

    // If an existing row has never had a snapshot, preserve its pre-update metrics first.
    // This makes the first real update useful for growth comparison instead of losing the baseline.
    if (old && !latestByKey.has(key)) {
      const baseline = snapshotFromContent(old, old.lastSource || 'backend', old.lastUpdatedAt || current.generatedAt || new Date().toISOString());
      nextSnapshots.push(baseline);
      latestByKey.set(key, baseline);
      summary.snapshotsAdded += 1;
    }

    const merged = mergeOne(old, raw, source, campaigns);
    if (old && idx !== undefined) {
      const changed = METRIC_KEYS.some((metric) => Number(old[metric] ?? 0) !== Number(merged[metric] ?? 0))
        || old.title !== merged.title
        || old.url !== merged.url
        || old.permalink !== merged.permalink;
      result[idx] = merged;
      if (changed) summary.updated += 1; else summary.unchanged += 1;
    } else {
      result.unshift(merged);
      // Every unshift moves the existing numeric indexes by one. Rebuild cheaply to keep
      // duplicate rows inside the same import file from creating clones.
      indexByKey.clear();
      result.forEach((content, index) => indexByKey.set(stableContentKey(content), index));
      summary.added += 1;
    }

    if (metricsChanged(merged, latestByKey.get(key))) {
      const snap = snapshotFromContent(merged, source);
      nextSnapshots.push(snap);
      latestByKey.set(key, snap);
      summary.snapshotsAdded += 1;
    }
  }

  return {
    data: {
      ...current,
      ...incoming,
      generatedAt: new Date().toISOString(),
      isDemo: incoming.isDemo ?? false,
      campaigns,
      contents: result,
      interactions: incoming.interactions ? mergeInteractions(current.interactions, incoming.interactions) : current.interactions,
      monthlyMetrics: incoming.monthlyMetrics?.length ? mergeMonthlyMetrics(current.monthlyMetrics, incoming.monthlyMetrics) : current.monthlyMetrics,
      platforms: incoming.platforms?.length ? mergePlatformMetrics(current.platforms, incoming.platforms) : current.platforms,
    },
    snapshots: nextSnapshots,
    summary,
  };
}

export function mergeCampaigns(existing: Campaign[], incoming: Campaign[]) {
  const map = new Map(existing.map((item) => [item.id, item]));
  for (const item of incoming) map.set(item.id, { ...map.get(item.id), ...item });
  return [...map.values()];
}

function mergeInteractions(existing: WorkspaceData['interactions'], incoming: WorkspaceData['interactions']) {
  const map = new Map(existing.map((item) => [item.id, item]));
  for (const item of incoming) {
    const old = map.get(item.id);
    map.set(item.id, {
      ...old,
      ...item,
      manualTopic: old?.manualTopic ?? item.manualTopic,
      manualCampaignId: old?.manualCampaignId ?? item.manualCampaignId,
      campaignId: old?.manualCampaignId ?? item.campaignId ?? old?.campaignId,
      reviewStatus: old?.reviewStatus ?? item.reviewStatus,
      excluded: old?.excluded ?? item.excluded,
    });
  }
  return [...map.values()];
}


function mergeMonthlyMetrics(existing: WorkspaceData['monthlyMetrics'], incoming: WorkspaceData['monthlyMetrics']) {
  const map = new Map(existing.map((item) => [item.month, item]));
  for (const item of incoming) map.set(item.month, { ...map.get(item.month), ...item });
  return [...map.values()].sort((a, b) => a.month.localeCompare(b.month));
}

function mergePlatformMetrics(existing: WorkspaceData['platforms'], incoming: WorkspaceData['platforms']) {
  const map = new Map(existing.map((item) => [item.platform, item]));
  for (const item of incoming) map.set(item.platform, { ...map.get(item.platform), ...item });
  return [...map.values()];
}
