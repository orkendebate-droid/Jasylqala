import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { OfflineBundleStatus, OfflinePendingTree, SpeciesInfo, Tree } from "../types";
import { UPLOAD_TIMEOUT_MS, apiUrl, fetchWithTimeout, isNetworkError, uploadPhoto } from "../api";

interface JasylqalaDB extends DBSchema {
  pendingTrees: {
    key: string;
    value: OfflinePendingTree;
  };
  cachedTrees: {
    key: number;
    value: Tree;
  };
  cachedSpecies: {
    key: string;
    value: SpeciesInfo;
  };
  meta: {
    key: string;
    value: OfflineBundleStatus;
  };
}

let dbPromise: Promise<IDBPDatabase<JasylqalaDB>> | null = null;

function getDb(): Promise<IDBPDatabase<JasylqalaDB>> {
  if (!dbPromise) {
    dbPromise = openDB<JasylqalaDB>("jasylqala-offline", 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("pendingTrees")) {
          db.createObjectStore("pendingTrees", { keyPath: "client_id" });
        }
        if (!db.objectStoreNames.contains("cachedTrees")) {
          db.createObjectStore("cachedTrees", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("cachedSpecies")) {
          db.createObjectStore("cachedSpecies", { keyPath: "id" });
        }
        if (!db.objectStoreNames.contains("meta")) {
          db.createObjectStore("meta");
        }
      },
    }).catch((err) => {
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
}

export async function addPendingTree(item: OfflinePendingTree): Promise<void> {
  const db = await getDb();
  await db.put("pendingTrees", item);
}

export async function getPendingTrees(): Promise<OfflinePendingTree[]> {
  const db = await getDb();
  return db.getAll("pendingTrees");
}

export async function removePendingTree(clientId: string): Promise<void> {
  const db = await getDb();
  await db.delete("pendingTrees", clientId);
}

async function replaceStore<K extends "cachedTrees" | "cachedSpecies">(
  storeName: K,
  items: Array<JasylqalaDB[K]["value"]>
): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(storeName, "readwrite");
  await tx.store.clear();
  for (const item of items) await tx.store.put(item);
  await tx.done;
}

export const saveCachedTrees = (trees: Tree[]) => replaceStore("cachedTrees", trees);
export const getCachedTrees = async (): Promise<Tree[]> => (await getDb()).getAll("cachedTrees");
export const saveCachedSpecies = (species: SpeciesInfo[]) => replaceStore("cachedSpecies", species);
export const getCachedSpecies = async (): Promise<SpeciesInfo[]> => (await getDb()).getAll("cachedSpecies");

export async function getBundleStatus(): Promise<OfflineBundleStatus> {
  const db = await getDb();
  const val = await db.get("meta", "bundle_status");
  return (
    val || {
      ready: false,
      downloadedAt: null,
      treesCount: 0,
      tilesCount: 0,
    }
  );
}

export async function setBundleStatus(status: OfflineBundleStatus): Promise<void> {
  const db = await getDb();
  await db.put("meta", status, "bundle_status");
}

export interface SyncResult {
  synced: number;
  failed: number;
}

let syncInFlight: Promise<SyncResult> | null = null;

/**
 * Отправляет офлайн-очередь на сервер.
 * Повторный вызов во время отправки возвращает тот же промис —
 * иначе событие `online` и перезагрузка данных запускают две отправки
 * и фото загружаются дважды.
 */
export function syncPendingTrees(): Promise<SyncResult> {
  if (!syncInFlight) {
    syncInFlight = doSyncPendingTrees().finally(() => {
      syncInFlight = null;
    });
  }
  return syncInFlight;
}

async function doSyncPendingTrees(): Promise<SyncResult> {
  const pending = await getPendingTrees();
  if (pending.length === 0) return { synced: 0, failed: 0 };

  const prepared: Array<{
    pendingItem: OfflinePendingTree;
    photo_url: string | null;
  }> = [];

  let failed = 0;

  for (const item of pending) {
    try {
      let photoUrl: string | null = item.photo_url || null;
      if (!photoUrl && item.photoBlob) {
        photoUrl = await uploadPhoto(item.photoBlob, `${item.client_id}.jpg`);
        item.photo_url = photoUrl;
        await addPendingTree(item);
      }
      prepared.push({ pendingItem: item, photo_url: photoUrl });
    } catch (err) {
      if (isNetworkError(err)) {
        // Сервер недоступен — не ждём таймаут на каждом фото, пробуем позже целиком
        return { synced: 0, failed: pending.length };
      }
      failed += 1;
    }
  }

  if (prepared.length === 0) {
    return { synced: 0, failed };
  }

  let resp: Response;
  try {
    resp = await fetchWithTimeout(
      apiUrl("/api/offline-sync"),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trees: prepared.map(({ pendingItem, photo_url }) => ({
            client_id: pendingItem.client_id,
            species: pendingItem.species,
            height_m: pendingItem.height_m,
            condition: pendingItem.condition,
            latitude: pendingItem.latitude,
            longitude: pendingItem.longitude,
            photo_url,
            notes: pendingItem.notes,
            is_demo: false,
          })),
        }),
      },
      UPLOAD_TIMEOUT_MS
    );
  } catch {
    // Сеть/сервер недоступны — очередь остаётся в телефоне до следующей попытки
    return { synced: 0, failed: pending.length };
  }

  if (!resp.ok) {
    return { synced: 0, failed: pending.length };
  }

  for (const { pendingItem } of prepared) {
    await removePendingTree(pendingItem.client_id);
  }

  return { synced: prepared.length, failed };
}
