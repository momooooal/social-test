import type { WorkspaceData } from './workspace-types';

const BACKEND_KEY = 'social-impact-backend-url';

export function getBackendUrl() {
  if (typeof window === 'undefined') return '';
  return (window.localStorage.getItem(BACKEND_KEY) ?? '').replace(/\/$/, '');
}

export function setBackendUrl(url: string) {
  const normalized = url.trim().replace(/\/$/, '').replace(/\/api$/, '');
  window.localStorage.setItem(BACKEND_KEY, normalized);
  return normalized;
}

export async function backendFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const base = getBackendUrl();
  if (!base) throw new Error('尚未設定後端 URL');
  const response = await fetch(`${base}${path.startsWith('/') ? path : `/${path}`}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(text || `HTTP ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function fetchBackendDataset() {
  return backendFetch<WorkspaceData>('/api/social/data');
}

export async function requestBackendSync() {
  return backendFetch<{ status: string; message: string; syncedAt: string; imported: number }>('/api/social/sync', { method: 'POST', body: JSON.stringify({ source: 'all' }) });
}

export async function fetchBackendStatus() {
  return backendFetch<{ mode: 'manual' | 'hybrid' | 'automatic'; sources: Array<{ source: string; label: string; status: 'healthy' | 'warning' | 'unavailable'; lastSynced: string; detail: string }> }>('/api/social/status');
}
