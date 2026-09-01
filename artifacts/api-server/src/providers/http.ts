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

export async function postForm<T>(url: string, values: Record<string, string>): Promise<T> {
  const body = new URLSearchParams(values);
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
  const text = await response.text();
  let parsed: unknown;
  try { parsed = text ? JSON.parse(text) : {}; } catch { parsed = { message: text }; }
  if (!response.ok) throw new Error((parsed as { error_message?: string; error?: { message?: string } }).error_message || (parsed as { error?: { message?: string } }).error?.message || `HTTP ${response.status}`);
  return parsed as T;
}
