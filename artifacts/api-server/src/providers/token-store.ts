import fs from 'node:fs/promises';
import path from 'node:path';

export interface StoredTokens {
  facebookUserToken?: string;
  facebookPageToken?: string;
  facebookPageId?: string;
  facebookPageName?: string;
  instagramUserId?: string;
  instagramUsername?: string;
  threadsToken?: string;
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
