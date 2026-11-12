import { apiUrl } from "../api";
import type { OfflineBundleStatus, SpeciesInfo, Tree } from "../types";
import { saveCachedSpecies, saveCachedTrees, setBundleStatus } from "./db";

export interface BundleProgress {
  stage: "data" | "model" | "map" | "done";
  percent: number;
  message: string;
}

// Aktau bounding box for offline map tiles (zoom 13–14)
const AKTAU_BOUNDS = {
  minLat: 43.62,
  maxLat: 43.69,
  minLon: 51.12,
  maxLon: 51.21,
};

function latLonToTile(lat: number, lon: number, zoom: number): { x: number; y: number } {
  const n = 2 ** zoom;
  const x = Math.floor(((lon + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);
  return { x, y };
}

export function buildAktauTileUrls(zooms: number[] = [13, 14]): string[] {
  const urls: string[] = [];
  for (const z of zooms) {
    const topLeft = latLonToTile(AKTAU_BOUNDS.maxLat, AKTAU_BOUNDS.minLon, z);
    const bottomRight = latLonToTile(AKTAU_BOUNDS.minLat, AKTAU_BOUNDS.maxLon, z);
    for (let x = topLeft.x; x <= bottomRight.x; x++) {
      for (let y = topLeft.y; y <= bottomRight.y; y++) {
        urls.push(`https://tile.openstreetmap.org/${z}/${x}/${y}.png`);
      }
    }
  }
  return urls;
}

export async function downloadOfflineBundle(
  onProgress?: (progress: BundleProgress) => void
): Promise<OfflineBundleStatus> {
  onProgress?.({ stage: "data", percent: 10, message: "Скачиваем паспорта деревьев и виды..." });

  const resp = await fetch(apiUrl("/api/offline-bundle"));
  if (!resp.ok) {
    throw new Error("Не удалось скачать данные с сервера");
  }
  const bundle: { species: SpeciesInfo[]; trees: Tree[] } = await resp.json();
  await saveCachedSpecies(bundle.species);
  await saveCachedTrees(bundle.trees);

  onProgress?.({ stage: "model", percent: 30, message: "Сохраняем нейросеть для офлайна..." });
  if (typeof caches !== "undefined") {
    const modelCache = await caches.open("jasylqala-ml-model");
    await modelCache.add("/models/species_weights.json");
  }

  onProgress?.({ stage: "map", percent: 45, message: "Кешируем карту Актау..." });
  const tileUrls = buildAktauTileUrls([13, 14]);
  let cachedTiles = 0;

  if (typeof caches !== "undefined") {
    const tileCache = await caches.open("aktau-map-tiles");
    for (let i = 0; i < tileUrls.length; i++) {
      try {
        const tileResp = await fetch(tileUrls[i], { mode: "cors" });
        if (tileResp.ok) {
          await tileCache.put(tileUrls[i], tileResp);
          cachedTiles += 1;
        }
      } catch {
        // Ignore single tile failure so offline download stays resilient
      }
      await new Promise((r) => setTimeout(r, 35));
      const pct = 45 + Math.round(((i + 1) / tileUrls.length) * 50);
      onProgress?.({
        stage: "map",
        percent: pct,
        message: `Карта Актау: ${i + 1} из ${tileUrls.length} фрагментов`,
      });
    }
  }

  const status: OfflineBundleStatus = {
    ready: true,
    downloadedAt: new Date().toISOString(),
    treesCount: bundle.trees.length,
    tilesCount: cachedTiles,
  };
  await setBundleStatus(status);
  onProgress?.({ stage: "done", percent: 100, message: "Офлайн-режим готов!" });
  return status;
}
