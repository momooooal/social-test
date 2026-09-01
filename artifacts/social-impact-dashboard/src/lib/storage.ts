import { asWorkspaceData, type ContentSnapshot, type DataSource, type WorkspaceData } from './workspace-types';
import { mergeWorkspaceData } from './merge';

const DB_NAME = 'social-impact-dashboard';
const DB_VERSION = 2;
const DATA_STORE = 'datasets';
const SNAPSHOT_STORE = 'content-snapshots';
const DATA_KEY = 'current';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(DATA_STORE)) db.createObjectStore(DATA_STORE);
      if (!db.objectStoreNames.contains(SNAPSHOT_STORE)) {
        const store = db.createObjectStore(SNAPSHOT_STORE, { keyPath: 'id' });
        store.createIndex('contentId', 'contentId', { unique: false });
        store.createIndex('stableKey', 'stableKey', { unique: false });
        store.createIndex('capturedAt', 'capturedAt', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB unavailable'));
  });
}

function txDone(tx: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });
}

export async function readStoredData(): Promise<WorkspaceData | null> {
  if (typeof indexedDB === 'undefined') return null;
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction(DATA_STORE, 'readonly').objectStore(DATA_STORE).get(DATA_KEY);
    request.onsuccess = () => resolve(request.result ? asWorkspaceData(request.result as WorkspaceData) : null);
    request.onerror = () => reject(request.error ?? new Error('Could not read local data'));
  });
}

export async function writeStoredData(data: WorkspaceData): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const db = await openDatabase();
  const tx = db.transaction(DATA_STORE, 'readwrite');
  tx.objectStore(DATA_STORE).put(asWorkspaceData(data), DATA_KEY);
  await txDone(tx);
}

export async function readSnapshots(contentId?: string): Promise<ContentSnapshot[]> {
  if (typeof indexedDB === 'undefined') return [];
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const store = db.transaction(SNAPSHOT_STORE, 'readonly').objectStore(SNAPSHOT_STORE);
    const request = contentId ? store.index('contentId').getAll(contentId) : store.getAll();
    request.onsuccess = () => resolve((request.result as ContentSnapshot[]).sort((a, b) => a.capturedAt.localeCompare(b.capturedAt)));
    request.onerror = () => reject(request.error ?? new Error('Could not read snapshots'));
  });
}

export async function writeSnapshots(snapshots: ContentSnapshot[]) {
  if (typeof indexedDB === 'undefined' || !snapshots.length) return;
  const db = await openDatabase();
  const tx = db.transaction(SNAPSHOT_STORE, 'readwrite');
  const store = tx.objectStore(SNAPSHOT_STORE);
  for (const snapshot of snapshots) store.put(snapshot);
  await txDone(tx);
}

export async function mergeAndStoreIncoming(currentFallback: WorkspaceData, incoming: Partial<WorkspaceData>, source: DataSource | string) {
  const current = (await readStoredData()) ?? currentFallback;
  const snapshots = await readSnapshots();
  const merged = mergeWorkspaceData(current, incoming, snapshots, source);
  await writeStoredData(merged.data);
  await writeSnapshots(merged.snapshots);
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(DATA_UPDATED_EVENT));
  return merged;
}

export async function updateWorkspace(mutator: (current: WorkspaceData) => WorkspaceData | Promise<WorkspaceData>, fallback: WorkspaceData) {
  const current = (await readStoredData()) ?? fallback;
  const next = await mutator(current);
  await writeStoredData(next);
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(DATA_UPDATED_EVENT));
  return next;
}

export async function clearWorkspace() {
  if (typeof indexedDB === 'undefined') return;
  const db = await openDatabase();
  const tx = db.transaction([DATA_STORE, SNAPSHOT_STORE], 'readwrite');
  tx.objectStore(DATA_STORE).clear();
  tx.objectStore(SNAPSHOT_STORE).clear();
  await txDone(tx);
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(DATA_UPDATED_EVENT));
}

export const DATA_UPDATED_EVENT = 'social-data-updated';
