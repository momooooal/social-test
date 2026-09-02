import fs from 'node:fs/promises';
import path from 'node:path';
import { getJson } from './http';

export interface StoredTokens {
  facebookUserToken?: string;
  facebookPageToken?: string;
  facebookPageId?: string;
  facebookPageName?: string;
  instagramUserId?: string;
  instagramUsername?: string;
  threadsToken?: string;
  threadsTokenExpiresAt?: string;
  threadsUserId?: string;
  threadsUsername?: string;
  updatedAt?: string;
}

const tokenPath = process.env.SOCIAL_TOKEN_FILE || path.resolve(process.cwd(), 'data/social-tokens.json');

export async function readTokens(): Promise<StoredTokens> {
  const env: StoredTokens = {
    facebookPageToken: process.env.FB_PAGE_ACCESS_TOKEN,
    facebookPageId: process.env.FB_PAGE_ID,
    instagramUserId: process.env.IG_USER_ID,
    threadsToken: process.env.THREADS_ACCESS_TOKEN,
  };
  try {
    const file = JSON.parse(await fs.readFile(tokenPath, 'utf8')) as StoredTokens;
    return { ...env, ...file };
  } catch { return env; }
}

export async function writeTokens(patch: Partial<StoredTokens>) {
  const current = await readTokens();
  const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
  await fs.mkdir(path.dirname(tokenPath), { recursive: true });
  await fs.writeFile(tokenPath, JSON.stringify(next, null, 2), { mode: 0o600 });
  return next;
}

/** Refresh a long-lived Threads token before the 60-day window closes. */
export async function refreshThreadsTokenIfNeeded() {
  const tokens = await readTokens();
  if (!tokens.threadsToken) return '';
  const expiresAt = tokens.threadsTokenExpiresAt ? Date.parse(tokens.threadsTokenExpiresAt) : 0;
  const refreshBefore = Date.now() + 7 * 24 * 60 * 60 * 1000;
  if (expiresAt > refreshBefore) return tokens.threadsToken;

  const refreshed = await getJson<{ access_token?: string; expires_in?: number }>(
    'https://graph.threads.net/refresh_access_token',
    { grant_type: 'th_refresh_token' },
    tokens.threadsToken,
  );
  const token = refreshed.access_token || tokens.threadsToken;
  const lifetimeSeconds = Number(refreshed.expires_in || 60 * 24 * 60 * 60);
  await writeTokens({
    threadsToken: token,
    threadsTokenExpiresAt: new Date(Date.now() + lifetimeSeconds * 1000).toISOString(),
  });
  return token;
}
