export async function getJson<T>(url: string, params: Record<string, string | number | undefined> = {}, token?: string): Promise<T> {
  const parsed = new URL(url);
  for (const [key, value] of Object.entries(params)) if (value !== undefined && value !== '') parsed.searchParams.set(key, String(value));
  const response = await fetch(parsed, { headers: token ? { Authorization: `Bearer ${token}` } : undefined });
  const text = await response.text();
  let body: unknown;
  try { body = text ? JSON.parse(text) : {}; } catch { body = { message: text }; }
  if (!response.ok) {
    const error = body as { error?: { message?: string; code?: number }; message?: string };
    throw new Error(error.error?.message || error.message || `HTTP ${response.status}`);
  }
  return body as T;
}

export interface GraphPage<T> {
  data: T[];
  paging?: { next?: string };
}

function configuredItemLimit() {
  const raw = Number(process.env.SOCIAL_SYNC_MAX_ITEMS || 500);
  if (!Number.isFinite(raw)) return 500;
  return Math.max(1, Math.min(Math.floor(raw), 2_000));
}

/** Follow Meta cursor pagination without allowing a paging URL to change hosts. */
export async function getAllPages<T>(
  url: string,
  params: Record<string, string | number | undefined> = {},
  token?: string,
  maxItems = configuredItemLimit(),
): Promise<T[]> {
  const expectedOrigin = new URL(url).origin;
  const rows: T[] = [];
  let next: string | undefined = url;
  let first = true;
  let pageCount = 0;

  while (next && rows.length < maxItems && pageCount < 50) {
    const parsed: URL = new URL(next);
    if (parsed.origin !== expectedOrigin) throw new Error('Meta pagination returned an unexpected host');
    const page: GraphPage<T> = await getJson<GraphPage<T>>(parsed.toString(), first ? params : {}, token);
    rows.push(...(page.data || []));
    next = page.paging?.next;
    first = false;
    pageCount += 1;
  }

  return rows.slice(0, maxItems);
}

export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const run = async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(1, concurrency), items.length || 1) }, run));
  return results;
}

export async function postForm<T>(url: string, values: Record<string, string>): Promise<T> {
  const body = new URLSearchParams(values);
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const text = await response.text();
  let parsed: unknown;
  try { parsed = text ? JSON.parse(text) : {}; } catch { parsed = { message: text }; }
  if (!response.ok) throw new Error((parsed as { error_message?: string; error?: { message?: string } }).error_message || (parsed as { error?: { message?: string } }).error?.message || `HTTP ${response.status}`);
  return parsed as T;
}
