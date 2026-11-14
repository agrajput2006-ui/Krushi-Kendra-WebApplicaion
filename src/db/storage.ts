import { AppDatabase } from '../types/models';

const DB_NAME = 'khushi_kendra_db_v1';
const STORE_NAME = 'app_state';
const RECORD_KEY = 'primary';
const LS_BACKUP_KEY = 'khushi_kendra_state_v1';

export interface DataAccessAdapter {
  load(): Promise<AppDatabase | null>;
  save(db: AppDatabase): Promise<void>;
  clear(): Promise<void>;
}

function openIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !('indexedDB' in window)) {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const request = window.indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Failed to open IndexedDB'));
  });
}

class IndexedDBAdapter implements DataAccessAdapter {
  async load(): Promise<AppDatabase | null> {
    try {
      const db = await openIDB();
      const result = await new Promise<AppDatabase | null>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(RECORD_KEY);
        req.onsuccess = () => resolve((req.result as AppDatabase) || null);
        req.onerror = () => reject(req.error);
      });
      db.close();
      if (result) return result;
    } catch {
      // Fallback to localStorage below
    }

    try {
      const raw = window.localStorage.getItem(LS_BACKUP_KEY);
      return raw ? (JSON.parse(raw) as AppDatabase) : null;
    } catch {
      return null;
    }
  }

  async save(state: AppDatabase): Promise<void> {
    try {
      window.localStorage.setItem(LS_BACKUP_KEY, JSON.stringify(state));
    } catch {
      // Ignore storage quota warning in localStorage mirror
    }

    try {
      const db = await openIDB();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.put(state, RECORD_KEY);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
      db.close();
    } catch {
      // localStorage already updated
    }
  }

  async clear(): Promise<void> {
    try {
      window.localStorage.removeItem(LS_BACKUP_KEY);
    } catch {
      // ignore
    }

    try {
      const db = await openIDB();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const req = store.delete(RECORD_KEY);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
      db.close();
    } catch {
      // ignore
    }
  }
}

// Clean swappable data-access layer (ready to replace with FirebaseAdapter)
export const dbAdapter: DataAccessAdapter = new IndexedDBAdapter();
