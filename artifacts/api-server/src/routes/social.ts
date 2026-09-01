import { Router, type IRouter } from 'express';
import { readDataset, rebuildAggregates, mergeProviderAccount, mergeProviderContents, writeDataset } from '../lib/social-store';
import { readTokens } from '../providers/token-store';
import { syncFacebook } from '../providers/facebook';
import { syncInstagram } from '../providers/instagram';
import { syncThreads } from '../providers/threads';
import { oauthCallback, oauthStartUrl } from '../providers/oauth';

const router: IRouter = Router();
let lastSyncAt: Record<string, string> = {};
let lastWarnings: Record<string, string[]> = {};

type SyncRow = { source: string; status: 'synced' | 'warning' | 'unavailable'; imported: number; message: string };

function dashboardRedirect(platform: string, ok: boolean, message = '') {
  const url = process.env.DASHBOARD_PUBLIC_URL;
  if (!url) return null;
  const base = url.includes('#') ? url : `${url.replace(/\/$/, '')}/#/settings`;
  const separator = base.includes('?') ? '&' : '?';
  return `${base}${separator}oauth=${encodeURIComponent(platform)}&status=${ok ? 'ok' : 'error'}&message=${encodeURIComponent(message)}`;
}

async function performSync(requested: string, log?: { warn: (obj: unknown, msg?: string) => void }) {
  const tokens = await readTokens();
  let dataset = await readDataset();
  const results: SyncRow[] = [];

  const run = async (source: string, task: (() => Promise<{ platform?: string; contents: any[]; account?: { followers?: number; reach?: number; views?: number; engagement?: number }; warnings: string[] }>) | null) => {
    if (requested !== 'all' && requested !== source) return;
    if (!task) {
      results.push({ source, status: 'unavailable', imported: 0, message: '尚未設定權限 / Token；可繼續使用手動匯入。' });
      return;
    }
    try {
      const result = await task();
      dataset = { ...dataset, contents: mergeProviderContents(dataset, result.contents) };
      dataset = mergeProviderAccount(dataset, result.platform || source, result.account);
      lastSyncAt[source] = new Date().toISOString();
      lastWarnings[source] = result.warnings;
      results.push({
        source,
        status: result.warnings.length ? 'warning' : 'synced',
        imported: result.contents.length,
        message: result.warnings.join('；') || '同步成功',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知同步錯誤';
      lastWarnings[source] = [message];
      results.push({ source, status: 'warning', imported: 0, message });
      log?.warn({ source, err: error }, 'Social provider sync failed');
    }
  };

  await run('facebook', tokens.facebookPageToken && tokens.facebookPageId ? () => syncFacebook(tokens.facebookPageId!, tokens.facebookPageToken!) : null);
  await run('instagram', tokens.facebookPageToken && tokens.instagramUserId ? () => syncInstagram(tokens.instagramUserId!, tokens.facebookPageToken!) : null);
  await run('threads', tokens.threadsToken ? () => syncThreads(tokens.threadsToken!) : null);

  if (results.some((item) => item.imported > 0)) {
    dataset = rebuildAggregates(dataset);
    await writeDataset(dataset);
  }

  const imported = results.reduce((sum, item) => sum + item.imported, 0);
  const configured = results.filter((item) => item.status !== 'unavailable');
  const successCount = configured.filter((item) => item.status === 'synced').length;
  const status = configured.length > 0 && successCount === configured.length ? 'synced' : imported > 0 ? 'partial' : 'unavailable';
  return {
    status,
    message: results.map((item) => `${item.source}: ${item.message}`).join('｜'),
    syncedAt: new Date().toISOString(),
    imported,
    details: results,
  };
}

router.get('/social/status', async (_req, res) => {
  const tokens = await readTokens();
  const sources = [
    { source: 'facebook', label: 'Facebook', configured: Boolean(tokens.facebookPageToken && tokens.facebookPageId) },
    { source: 'instagram', label: 'Instagram', configured: Boolean(tokens.facebookPageToken && tokens.instagramUserId) },
    { source: 'threads', label: 'Threads', configured: Boolean(tokens.threadsToken) },
    { source: 'messenger', label: 'Messenger / IG DM', configured: false },
  ].map((source) => ({
    source: source.source,
    label: source.label,
    status: source.configured ? (lastWarnings[source.source]?.length ? 'warning' : 'healthy') : 'unavailable',
    lastSynced: lastSyncAt[source.source] || '',
    detail: source.configured
      ? (lastWarnings[source.source]?.join('；') || (lastSyncAt[source.source] ? '最近一次同步成功' : '已設定，可執行同步'))
      : (source.source === 'messenger' ? '需額外 Messaging / Advanced Access；先用手動匯入備援' : '尚未連結帳號或設定 Token'),
  }));
  res.json({ mode: tokens.facebookPageToken || tokens.threadsToken ? 'hybrid' : 'manual', sources });
});

router.get('/social/data', async (_req, res) => res.json(await readDataset()));

router.get('/social/accounts', async (_req, res) => {
  const tokens = await readTokens();
  res.json([
    { id: 'facebook', platform: 'facebook', accountName: tokens.facebookPageName || (tokens.facebookPageId ? `Page ${tokens.facebookPageId}` : 'Facebook'), nativeAccountId: tokens.facebookPageId || null, status: tokens.facebookPageToken ? 'connected' : 'unavailable', lastSynced: lastSyncAt.facebook || null, detail: tokens.facebookPageToken ? 'Page access token 已設定' : '尚未授權' },
    { id: 'instagram', platform: 'instagram', accountName: tokens.instagramUsername || (tokens.instagramUserId ? `Instagram ${tokens.instagramUserId}` : 'Instagram'), nativeAccountId: tokens.instagramUserId || null, status: tokens.instagramUserId && tokens.facebookPageToken ? 'connected' : 'unavailable', lastSynced: lastSyncAt.instagram || null, detail: tokens.instagramUserId ? 'Professional account 已連結' : '需要 Page-linked Instagram Professional account' },
    { id: 'threads', platform: 'threads', accountName: tokens.threadsUsername || 'Threads', nativeAccountId: tokens.threadsUserId || null, status: tokens.threadsToken ? 'connected' : 'unavailable', lastSynced: lastSyncAt.threads || null, detail: tokens.threadsToken ? 'Threads token 已設定' : '尚未授權' },
  ]);
});

router.post('/social/sync', async (req, res) => {
  const requested = String(req.body?.source || 'all');
  res.json(await performSync(requested, req.log));
});

// Optional endpoint for GitHub Actions / cron. Unlike the interactive endpoint,
// this one must have a server-only secret so a public repository can schedule
// syncs without exposing Meta tokens or the trigger credential in frontend JS.
router.post('/social/sync/scheduled', async (req, res) => {
  const expected = process.env.SCHEDULE_SYNC_KEY;
  if (!expected) return res.status(503).json({ message: 'SCHEDULE_SYNC_KEY is not configured' });
  const provided = String(req.header('x-sync-key') || '');
  if (!provided || provided !== expected) return res.status(401).json({ message: 'Invalid sync key' });
  res.json(await performSync('all', req.log));
});

router.get('/social/auth/:platform/start', (req, res) => {
  const platform = req.params.platform as 'facebook' | 'instagram' | 'threads';
  if (!['facebook', 'instagram', 'threads'].includes(platform)) return res.status(404).json({ message: 'Unsupported platform' });
  try { res.redirect(oauthStartUrl(platform)); }
  catch (error) { res.status(500).send(error instanceof Error ? error.message : 'OAuth configuration error'); }
});

router.get('/social/auth/:platform/callback', async (req, res) => {
  const platform = req.params.platform as 'facebook' | 'instagram' | 'threads';
  const code = String(req.query.code || '');
  const state = String(req.query.state || '');
  if (!code || !state) return res.status(400).send('Missing OAuth code/state');
  try {
    await oauthCallback(platform, code, state);
    const redirect = dashboardRedirect(platform, true, 'connected');
    if (redirect) return res.redirect(redirect);
    res.send(`<meta charset="utf-8"><title>連結完成</title><body style="font-family:sans-serif;padding:40px"><h2>✅ ${platform} 連結完成</h2><p>可以回到社群效益分析 Dashboard 執行「立即同步」。</p></body>`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'OAuth failed';
    const redirect = dashboardRedirect(platform, false, message);
    if (redirect) return res.redirect(redirect);
    res.status(500).send(message);
  }
});

export default router;
