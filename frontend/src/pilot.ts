import type { Tree } from "./types";

/**
 * Пилотный квартал Актау (кейс: «1 квартал, 300 деревьев»).
 * Дублирует backend/app/pilot.py — при изменении границ правьте оба файла.
 * Границы приблизительные: сверьте с местностью перед выездом.
 * Считается на клиенте, чтобы прогресс был виден и без интернета.
 */
export const PILOT = {
  id: "aktau-mkr-4",
  name: "4 микрорайон",
  target: 300,
  // [lon, lat], замкнутое кольцо
  polygon: [
    [51.153, 43.6545],
    [51.1625, 43.6545],
    [51.1625, 43.6485],
    [51.153, 43.6485],
    [51.153, 43.6545],
  ] as [number, number][],
};

export const PILOT_BOUNDS: [[number, number], [number, number]] = [
  [Math.min(...PILOT.polygon.map((p) => p[0])), Math.min(...PILOT.polygon.map((p) => p[1]))],
  [Math.max(...PILOT.polygon.map((p) => p[0])), Math.max(...PILOT.polygon.map((p) => p[1]))],
];

export function isInPilot(lat: number, lon: number): boolean {
  let inside = false;
  const ring = PILOT.polygon;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[i + 1];
    if (y1 > lat !== y2 > lat) {
      const xCross = x1 + ((lat - y1) * (x2 - x1)) / (y2 - y1);
      if (lon < xCross) inside = !inside;
    }
  }
  return inside;
}

export interface PilotStats {
  /** Реальные (не демо) деревья в квартале, включая ещё не отправленные с телефона */
  real: number;
  total: number;
  poor: number;
  percent: number;
}

export function pilotStats(trees: Tree[]): PilotStats {
  const inZone = trees.filter((t) => isInPilot(t.latitude, t.longitude));
  const real = inZone.filter((t) => !t.is_demo).length;
  return {
    real,
    total: inZone.length,
    poor: inZone.filter((t) => t.condition === "poor").length,
    percent: Math.min(100, Math.round((real / PILOT.target) * 100)),
  };
}

/** Расстояние в метрах (haversine). */
export function distanceM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Ближайшее уже внесённое дерево в радиусе radiusM — чтобы не посчитать одно дерево дважды. */
export function findNearbyTree(trees: Tree[], lat: number, lon: number, radiusM = 3): Tree | null {
  let best: Tree | null = null;
  let bestD = radiusM;
  for (const t of trees) {
    const d = distanceM(lat, lon, t.latitude, t.longitude);
    if (d <= bestD) {
      best = t;
      bestD = d;
    }
  }
  return best;
}
