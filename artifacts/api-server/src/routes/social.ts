import crypto from 'node:crypto';
import { Router, type IRouter } from 'express';
import { readDataset, rebuildAggregates, mergeProviderAccount, mergeProviderContents, writeDataset, type SocialDataset } from '../lib/social-store';
import { readTokens, refreshThreadsTokenIfNeeded } from '../providers/token-store';
import { syncFacebook } from '../providers/facebook';
import { syncInstagram } from '../providers/instagram';
import { syncThreads } from '../providers/threads';
import { oauthCallback, oauthPublicConfig, oauthStartUrl } from '../providers/oauth';
import type { ProviderResult } from '../providers/types';

const router: IRouter = Router();
const supportedSources = new Set(['all', 'facebook', 'instagram', 'threads']);
let activeSync: Promise<SyncResponse> | null = null;

type SyncRow = { source: string; status: 'synced' | 'warning' | 'unavailable'; imported: number; message: string };
type SyncResponse = {
  status: 'synced' | 'partial' | 'unavailable';
  message: string;
  syncedAt: string;
  imported: number;
  details: SyncRow[];
};

function dashboardRedirect(platform: string, ok: boolean, message = '') {
  const url = process.env.DASHBOARD_PUBLIC_URL;
  if (!url) return null;
  const base = url.includes('#') ? url : `${url.replace(/\/$/, '')}/#/settings`;
  const separator = base.includes('?') ? '&' : '?';
  return `${base}${separator}oauth=${encodeURIComponent(platform)}&status=${ok ? 'ok' : 'error'}&message=${encodeURIComponent(message)}`;
}

function withSyncState(dataset: SocialDataset, source: string, warnings: string[], lastSynced?: string): SocialDataset {
  const previous = dataset.syncState?.[source] || {};
  return {
    ...dataset,
    syncState: {
      ...(dataset.syncState || {}),
      [source]: {
        ...previous,
        ...(lastSynced ? { lastSynced } : {}),
        warnings,
      },
    },
  };
}

async function performSyncUnlocked(requested: string, log?: { warn: (obj: unknown, msg?: string) => void }): Promise<SyncResponse> {
  const tokens = await readTokens();
  let dataset = await readDataset();
  const results: SyncRow[] = [];
  let successfulProvider = false;

  const run = async (source: string, task: (() => Promise<ProviderResult>) | null) => {
    if (requested !== 'all' && requested !== source) return;
    if (!task) {
      results.push({ source, status: 'unavailable', imported: 0, message: '尚未設定權限 / Token；可繼續使用手動匯入。' });
      return;
    }
    try {
      const result = await task();
      successfulProvider = true;
      dataset = { ...dataset, contents: mergeProviderContents(dataset, result.contents) };
      dataset = mergeProviderAccount(dataset, result.platform, result.account);
      const syncedAt = new Date().toISOString();
      dataset = withSyncState(dataset, source, result.warnings, syncedAt);
      results.push({
        source,
        status: result.warnings.length ? 'warning' : 'synced',
        imported: result.contents.length,
        message: result.warnings.join('；') || '同步成功',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知同步錯誤';
      dataset = withSyncState(dataset, source, [message]);
      results.push({ source, status: 'warning', imported: 0, message });
      log?.warn({ source, err: error }, 'Social provider sync failed');
    }
  };

  await run('facebook', tokens.facebookPageToken && tokens.facebookPageId
    ? () => syncFacebook(tokens.facebookPageId!, tokens.facebookPageToken!)
    : null);
  await run('instagram', tokens.facebookPageToken && tokens.instagramUserId
    ? () => syncInstagram(tokens.instagramUserId!, tokens.facebookPageToken!)
    : null);

  let threadsToken = tokens.threadsToken || '';
  let refreshWarning = '';
  if (threadsToken && (requested === 'all' || requested === 'threads')) {
    try {
      threadsToken = await refreshThreadsTokenIfNeeded();
    } catch (error) {
      refreshWarning = `Threads Token 自動續期失敗：${error instanceof Error ? error.message : '未知錯誤'}`;
    }
  }
  await run('threads', threadsToken
    ? async () => {
      const result = await syncThreads(threadsToken);
      return refreshWarning ? { ...result, warnings: [refreshWarning, ...result.warnings] } : result;
    }
    : null);

  if (successfulProvider) dataset = rebuildAggregates(dataset);
  if (results.some((item) => item.status !== 'unavailable')) await writeDataset(dataset);

  const imported = results.reduce((sum, item) => sum + item.imported, 0);
  const configured = results.filter((item) => item.status !== 'unavailable');
  const status: SyncResponse['status'] = configured.length === 0
    ? 'unavailable'
    : configured.every((item) => item.status === 'synced')
      ? 'synced'
      : 'partial';
  return {
    status,
    message: results.map((item) => `${item.source}: ${item.message}`).join('｜'),
    syncedAt: new Date().toISOString(),
    imported,
    details: results,
  };
}

async function performSync(requested: string, log?: { warn: (obj: unknown, msg?: string) => void }) {
  if (activeSync) return activeSync;
  activeSync = performSyncUnlocked(requested, log);
  try {
    return await activeSync;
  } finally {
    activeSync = null;
  }
}

router.get('/social/status', async (_req, res) => {
  const [tokens, dataset] = await Promise.all([readTokens(), readDataset()]);
  const sources = [
    { source: 'facebook', label: 'Facebook', configured: Boolean(tokens.facebookPageToken && tokens.facebookPageId) },
    { source: 'instagram', label: 'Instagram', configured: Boolean(tokens.facebookPageToken && tokens.instagramUserId) },
    { source: 'threads', label: 'Threads', configured: Boolean(tokens.threadsToken) },
    { source: 'messenger', label: 'Messenger / IG DM', configured: false },
  ].map((source) => {
    const state = dataset.syncState?.[source.source];
    return {
      source: source.source,
      label: source.label,
      status: source.configured ? (state?.warnings?.length ? 'warning' : 'healthy') : 'unavailable',
      lastSynced: state?.lastSynced || '',
      detail: source.configured
        ? (state?.warnings?.join('；') || (state?.lastSynced ? '最近一次同步成功' : '已設定，可執行同步'))
        : (source.source === 'messenger' ? '需額外 Messaging / Advanced Access；先用手動匯入備援' : '尚未連結帳號或設定 Token'),
    };
  });
  res.set('Cache-Control', 'no-store').json({ mode: tokens.facebookPageToken || tokens.threadsToken ? 'hybrid' : 'manual', sources });
});

router.get('/social/data', async (_req, res) => res.set('Cache-Control', 'no-store').json(await readDataset()));

router.get('/social/accounts', async (_req, res) => {
  const [tokens, dataset] = await Promise.all([readTokens(), readDataset()]);
  res.set('Cache-Control', 'no-store').json([
    { id: 'facebook', platform: 'facebook', accountName: tokens.facebookPageName || (tokens.facebookPageId ? `Page ${tokens.facebookPageId}` : 'Facebook'), nativeAccountId: tokens.facebookPageId || null, status: tokens.facebookPageToken ? 'connected' : 'unavailable', lastSynced: dataset.syncState?.facebook?.lastSynced || null, detail: tokens.facebookPageToken ? 'Page access token 已設定' : '尚未授權' },
    { id: 'instagram', platform: 'instagram', accountName: tokens.instagramUsername || (tokens.instagramUserId ? `Instagram ${tokens.instagramUserId}` : 'Instagram'), nativeAccountId: tokens.instagramUserId || null, status: tokens.instagramUserId && tokens.facebookPageToken ? 'connected' : 'unavailable', lastSynced: dataset.syncState?.instagram?.lastSynced || null, detail: tokens.instagramUserId ? 'Professional account 已連結' : '需要 Page-linked Instagram Professional account' },
    { id: 'threads', platform: 'threads', accountName: tokens.threadsUsername || 'Threads', nativeAccountId: tokens.threadsUserId || null, status: tokens.threadsToken ? 'connected' : 'unavailable', lastSynced: dataset.syncState?.threads?.lastSynced || null, detail: tokens.threadsToken ? 'Threads token 已設定並會在到期前自動續期' : '尚未授權' },
  ]);
});

router.get('/social/oauth/config', (_req, res) => {
  res.set('Cache-Control', 'no-store').json(oauthPublicConfig());
});

router.post('/social/sync', async (req, res) => {
  const requested = String(req.body?.source || 'all').toLowerCase();
  if (!supportedSources.has(requested)) return res.status(400).json({ message: 'Unsupported sync source' });
  return res.json(await performSync(requested, req.log));
});

// Optional endpoint for GitHub Actions / cron. Unlike the interactive endpoint,
// this one must have a server-only secret so a public repository can schedule
// syncs without exposing Meta tokens or the trigger credential in frontend JS.
router.post('/social/sync/scheduled', async (req, res) => {
  const expected = process.env.SCHEDULE_SYNC_KEY || '';
  if (!expected) return res.status(503).json({ message: 'SCHEDULE_SYNC_KEY is not configured' });
  const provided = String(req.header('x-sync-key') || '');
  const valid = provided.length === expected.length
    && crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
  if (!valid) return res.status(401).json({ message: 'Invalid sync key' });
  return res.json(await performSync('all', req.log));
});

router.get('/social/auth/:platform/start', (req, res) => {
  const platform = req.params.platform as 'facebook' | 'instagram' | 'threads';
  if (!['facebook', 'instagram', 'threads'].includes(platform)) return res.status(404).json({ message: 'Unsupported platform' });
  try {
    return res.redirect(oauthStartUrl(platform));
  } catch (error) {
    return res.status(500).type('text/plain').send(error instanceof Error ? error.message : 'OAuth configuration error');
  }
});

router.get('/social/auth/:platform/callback', async (req, res) => {
  const platform = req.params.platform as 'facebook' | 'instagram' | 'threads';
  if (!['facebook', 'instagram', 'threads'].includes(platform)) return res.status(404).type('text/plain').send('Unsupported platform');
  const code = String(req.query.code || '');
  const state = String(req.query.state || '');
  if (!code || !state) return res.status(400).type('text/plain').send('Missing OAuth code/state');
  try {
    await oauthCallback(platform, code, state);
    const redirect = dashboardRedirect(platform, true, 'connected');
    if (redirect) return res.redirect(redirect);
    res.send(`<meta charset="utf-8"><title>連結完成</title><body style="font-family:sans-serif;padding:40px"><h2>✅ ${platform} 連結完成</h2><p>可以回到社群效益分析 Dashboard 執行「立即同步」。</p></body>`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'OAuth failed';
    const redirect = dashboardRedirect(platform, false, message);
    if (redirect) return res.redirect(redirect);
    res.status(500).type('text/plain').send(message);
  }
});

export default router;
