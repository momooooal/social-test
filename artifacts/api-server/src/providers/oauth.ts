import crypto from 'node:crypto';
import { getJson, postForm } from './http';
import { writeTokens } from './token-store';

const metaVersion = process.env.META_API_VERSION || 'v25.0';
const stateSecret = process.env.OAUTH_STATE_SECRET || process.env.META_APP_SECRET || (process.env.NODE_ENV === 'production' ? '' : 'development-only-change-me');
const FACEBOOK_SCOPES = ['pages_show_list', 'pages_read_engagement'];
const INSTAGRAM_SCOPES = ['pages_show_list', 'pages_read_engagement', 'instagram_basic', 'instagram_manage_insights'];
const THREADS_SCOPES = ['threads_basic', 'threads_manage_insights'];

function callbackUrl(platform: string) {
  const base = (process.env.BACKEND_PUBLIC_URL || '').replace(/\/$/, '');
  if (!base) throw new Error('BACKEND_PUBLIC_URL is required for OAuth');
  return `${base}/api/social/auth/${platform}/callback`;
}

function makeState(platform: string) {
  if (!stateSecret) throw new Error('OAUTH_STATE_SECRET or META_APP_SECRET is required in production');
  const time = Date.now().toString();
  const payload = `${platform}.${time}`;
  const sig = crypto.createHmac('sha256', stateSecret).update(payload).digest('base64url');
  return Buffer.from(`${payload}.${sig}`).toString('base64url');
}

function verifyState(state: string, platform: string) {
  if (!stateSecret) return false;
  try {
    const decoded = Buffer.from(state, 'base64url').toString('utf8');
    const [statePlatform, time, sig] = decoded.split('.');
    if (statePlatform !== platform || Date.now() - Number(time) > 15 * 60 * 1000) return false;
    const expected = crypto.createHmac('sha256', stateSecret).update(`${statePlatform}.${time}`).digest('base64url');
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch { return false; }
}

export function oauthStartUrl(platform: 'facebook' | 'instagram' | 'threads') {
  if (platform === 'threads') {
    const clientId = process.env.THREADS_APP_ID || process.env.META_APP_ID;
    if (!clientId) throw new Error('THREADS_APP_ID is not configured');
    const url = new URL('https://threads.net/oauth/authorize');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', callbackUrl(platform));
    url.searchParams.set('scope', THREADS_SCOPES.join(','));
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('state', makeState(platform));
    return url.toString();
  }

  const clientId = process.env.META_APP_ID;
  if (!clientId) throw new Error('META_APP_ID is not configured');
  const url = new URL(`https://www.facebook.com/${metaVersion}/dialog/oauth`);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', callbackUrl(platform));
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', (platform === 'instagram' ? INSTAGRAM_SCOPES : FACEBOOK_SCOPES).join(','));
  url.searchParams.set('state', makeState(platform));
  return url.toString();
}

async function finishFacebookLike(platform: 'facebook' | 'instagram', code: string) {
  const clientId = process.env.META_APP_ID;
  const clientSecret = process.env.META_APP_SECRET;
  if (!clientId || !clientSecret) throw new Error('META_APP_ID / META_APP_SECRET are required');
  const short = await getJson<{ access_token: string }>(`https://graph.facebook.com/${metaVersion}/oauth/access_token`, {
    client_id: clientId, client_secret: clientSecret, redirect_uri: callbackUrl(platform), code,
  });

  let userToken = short.access_token;
  try {
    const long = await getJson<{ access_token: string }>(`https://graph.facebook.com/${metaVersion}/oauth/access_token`, {
      grant_type: 'fb_exchange_token', client_id: clientId, client_secret: clientSecret, fb_exchange_token: short.access_token,
    });
    if (long.access_token) userToken = long.access_token;
  } catch {
    // Short-lived token is still usable for initial setup; status/sync will expose expiry errors later.
  }

  const pages = await getJson<{ data: Array<{ id: string; name: string; access_token: string; instagram_business_account?: { id: string } }> }>(`https://graph.facebook.com/${metaVersion}/me/accounts`, {
    fields: 'id,name,access_token,instagram_business_account', limit: 100,
  }, userToken);
  const configuredPageId = process.env.FB_PAGE_ID;
  const page = pages.data.find((item) => configuredPageId && item.id === configuredPageId) || pages.data[0];
  if (!page) throw new Error('No manageable Facebook Page was returned by Meta');

  let instagramUsername: string | undefined;
  if (page.instagram_business_account?.id) {
    try {
      const ig = await getJson<{ username?: string }>(`https://graph.facebook.com/${metaVersion}/${page.instagram_business_account.id}`, { fields: 'username' }, page.access_token);
      instagramUsername = ig.username;
    } catch { /* optional display metadata */ }
  }

  await writeTokens({
    facebookUserToken: userToken,
    facebookPageToken: page.access_token,
    facebookPageId: page.id,
    facebookPageName: page.name,
    instagramUserId: page.instagram_business_account?.id,
    instagramUsername,
  });
  return { account: page.name, pageId: page.id, instagramUserId: page.instagram_business_account?.id };
}

async function finishThreads(code: string) {
  const clientId = process.env.THREADS_APP_ID || process.env.META_APP_ID;
  const clientSecret = process.env.THREADS_APP_SECRET || process.env.META_APP_SECRET;
  if (!clientId || !clientSecret) throw new Error('THREADS_APP_ID / THREADS_APP_SECRET are required');
  const short = await postForm<{ access_token: string; user_id?: string; expires_in?: number }>('https://graph.threads.net/oauth/access_token', {
    client_id: clientId, client_secret: clientSecret, grant_type: 'authorization_code', redirect_uri: callbackUrl('threads'), code,
  });
  let accessToken = short.access_token;
  let expiresIn = Number(short.expires_in || 60 * 60);
  try {
    const long = await getJson<{ access_token: string; expires_in?: number }>('https://graph.threads.net/access_token', {
      grant_type: 'th_exchange_token', client_secret: clientSecret, access_token: short.access_token,
    });
    accessToken = long.access_token;
    expiresIn = Number(long.expires_in || 60 * 24 * 60 * 60);
  } catch { /* a valid short token is still useful for initial testing */ }
  let threadsUsername: string | undefined;
  try {
    const profile = await getJson<{ id?: string; username?: string }>('https://graph.threads.net/me', { fields: 'id,username' }, accessToken);
    threadsUsername = profile.username;
    await writeTokens({ threadsToken: accessToken, threadsTokenExpiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(), threadsUserId: profile.id || short.user_id, threadsUsername });
  } catch {
    await writeTokens({ threadsToken: accessToken, threadsTokenExpiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(), threadsUserId: short.user_id });
  }
  return { userId: short.user_id, username: threadsUsername };
}

export async function oauthCallback(platform: 'facebook' | 'instagram' | 'threads', code: string, state: string) {
  if (!verifyState(state, platform)) throw new Error('Invalid or expired OAuth state');
  return platform === 'threads' ? finishThreads(code) : finishFacebookLike(platform, code);
}

export function oauthPublicConfig() {
  const backendPublicUrl = (process.env.BACKEND_PUBLIC_URL || '').replace(/\/$/, '');
  const callback = (platform: string) => backendPublicUrl ? `${backendPublicUrl}/api/social/auth/${platform}/callback` : '';
  return {
    backendPublicUrl,
    callbacks: {
      facebook: callback('facebook'),
      instagram: callback('instagram'),
      threads: callback('threads'),
    },
    scopes: {
      facebook: FACEBOOK_SCOPES,
      instagram: INSTAGRAM_SCOPES,
      threads: THREADS_SCOPES,
    },
    configured: {
      metaApp: Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET),
      threadsApp: Boolean((process.env.THREADS_APP_ID || process.env.META_APP_ID) && (process.env.THREADS_APP_SECRET || process.env.META_APP_SECRET)),
      backendPublicUrl: Boolean(backendPublicUrl),
      dashboardPublicUrl: Boolean(process.env.DASHBOARD_PUBLIC_URL),
    },
  };
}
