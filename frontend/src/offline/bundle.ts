import { apiUrl } from "../api";
import type { OfflineBundleStatus, OfflinePart, SpeciesInfo, Tree } from "../types";
import { PILOT_BOUNDS } from "../pilot";
import { getBundleStatus, saveCachedSpecies, saveCachedTrees, setBundleStatus } from "./db";

export interface BundleProgress {
  stage: OfflinePart | "done";
  percent: number;
  message: string;
}

type Progress = (progress: BundleProgress) => void;

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

interface Bounds {
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
}

function buildTileUrls(bounds: Bounds, zooms: number[]): string[] {
  const urls: string[] = [];
  for (const z of zooms) {
    const topLeft = latLonToTile(bounds.maxLat, bounds.minLon, z);
    const bottomRight = latLonToTile(bounds.minLat, bounds.maxLon, z);
    for (let x = topLeft.x; x <= bottomRight.x; x++) {
      for (let y = topLeft.y; y <= bottomRight.y; y++) {
        urls.push(`https://tile.openstreetmap.org/${z}/${x}/${y}.png`);
      }
    }
  }
  return urls;
}

/** Обзорная карта всего города (масштабы 13–14). */
export function buildAktauTileUrls(zooms: number[] = [13, 14]): string[] {
  return buildTileUrls(AKTAU_BOUNDS, zooms);
}

/**
 * Подробная карта только пилотного квартала (масштабы 15–18) с запасом ~100 м по краям.
 * На 13–14 один тайл — это ~2 км, отдельные деревья не различить; на 17–18 видно дворы и аллеи.
 * Квартал маленький, поэтому это всего около сотни тайлов.
 */
export function buildPilotTileUrls(zooms: number[] = [15, 16, 17, 18]): string[] {
  const pad = 0.001;
  return buildTileUrls(
    {
      minLon: PILOT_BOUNDS[0][0] - pad,
      minLat: PILOT_BOUNDS[0][1] - pad,
      maxLon: PILOT_BOUNDS[1][0] + pad,
      maxLat: PILOT_BOUNDS[1][1] + pad,
    },
    zooms
  );
}

/** Всё, что скачивает кнопка «Карта Актау». */
export function buildOfflineTileUrls(): string[] {
  return [...buildAktauTileUrls([13, 14]), ...buildPilotTileUrls()];
}

export const ALL_PARTS: OfflinePart[] = ["data", "model", "map"];

/** Какие части скачаны. Старый статус без `parts` трактуем как «скачано всё». */
export function getParts(status: OfflineBundleStatus): Record<OfflinePart, boolean> {
  if (status.parts) return status.parts;
  return { data: status.ready, model: status.ready, map: status.ready };
}

async function fetchData(onProgress?: Progress): Promise<number> {
  onProgress?.({ stage: "data", percent: 10, message: "Скачиваем паспорта деревьев и виды..." });
  const resp = await fetch(apiUrl("/api/offline-bundle"));
  if (!resp.ok) {
    throw new Error("Не удалось скачать данные с сервера");
  }
  const bundle: { species: SpeciesInfo[]; trees: Tree[] } = await resp.json();
  await saveCachedSpecies(bundle.species);
  await saveCachedTrees(bundle.trees);
  return bundle.trees.length;
}

async function fetchModel(onProgress?: Progress): Promise<void> {
  onProgress?.({ stage: "model", percent: 50, message: "Сохраняем нейросеть для офлайна..." });
  if (typeof caches !== "undefined") {
    const modelCache = await caches.open("jasylqala-ml-model");
    await modelCache.add("/models/species_weights.json");
  }
}

async function fetchMap(onProgress?: Progress): Promise<number> {
  const tileUrls = buildOfflineTileUrls();
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
      onProgress?.({
        stage: "map",
        percent: Math.round(((i + 1) / tileUrls.length) * 100),
        message: `Карта: ${i + 1} из ${tileUrls.length} фрагментов`,
      });
    }
  }
  return cachedTiles;
}

/** Скачивает одну часть офлайн-пакета и сохраняет статус. Остальные части не трогает. */
export async function downloadOfflinePart(
  part: OfflinePart,
  onProgress?: Progress
): Promise<OfflineBundleStatus> {
  const prev = await getBundleStatus();
  const next: OfflineBundleStatus = { ...prev, parts: { ...getParts(prev) } };

  if (part === "data") next.treesCount = await fetchData(onProgress);
  else if (part === "model") await fetchModel(onProgress);
  else next.tilesCount = await fetchMap(onProgress);

  next.parts![part] = true;
  next.ready = true;
  next.downloadedAt = new Date().toISOString();
  await setBundleStatus(next);
  onProgress?.({ stage: "done", percent: 100, message: "Готово!" });
  return next;
}

/** Скачивает всё сразу: данные, нейросеть, карту. */
export async function downloadOfflineBundle(onProgress?: Progress): Promise<OfflineBundleStatus> {
  let status = await getBundleStatus();
  for (const part of ALL_PARTS) {
    status = await downloadOfflinePart(part, onProgress);
  }
  onProgress?.({ stage: "done", percent: 100, message: "Офлайн-режим готов!" });
  return status;
}
