import type { Tree } from "./types";

/**
 * Пилотный квартал Актау (кейс: «1 квартал, 300 деревьев») — 10 микрорайон.
 * Граница взята из OpenStreetMap (way 327567974, © участники OpenStreetMap, ODbL).
 * Дублирует backend/app/pilot.py — при смене квартала правьте оба файла.
 * Считается на клиенте, чтобы прогресс был виден и без интернета.
 */
export const PILOT = {
  id: "aktau-mkr-10",
  name: "10 микрорайон",
  target: 300,
  // [lon, lat], замкнутое кольцо
  polygon: [
    [51.1527922, 43.6522557],
    [51.152801, 43.6521838],
    [51.1528361, 43.6520896],
    [51.1532948, 43.6516217],
    [51.154879, 43.65006],
    [51.1558741, 43.6490341],
    [51.1560377, 43.6489361],
    [51.1567354, 43.6482205],
    [51.1567646, 43.6481481],
    [51.1569631, 43.647955],
    [51.1570637, 43.6479171],
    [51.1571374, 43.6479152],
    [51.1572112, 43.6479356],
    [51.1573091, 43.647986],
    [51.1577914, 43.6482338],
    [51.1581521, 43.6483773],
    [51.1584877, 43.6484453],
    [51.1588293, 43.6484618],
    [51.1605235, 43.6484414],
    [51.1618482, 43.6484608],
    [51.1622294, 43.6484665],
    [51.1624972, 43.6484705],
    [51.1631515, 43.6485059],
    [51.1635943, 43.6486025],
    [51.1640327, 43.6487281],
    [51.1658569, 43.6496775],
    [51.1663007, 43.6499348],
    [51.1664106, 43.6500523],
    [51.1664455, 43.6502289],
    [51.1664669, 43.6505976],
    [51.1638384, 43.6533107],
    [51.162862, 43.6527712],
    [51.1613211, 43.6542073],
    [51.159355, 43.6532214],
    [51.1583573, 43.6528993],
    [51.1573702, 43.6527518],
    [51.1556245, 43.6526376],
    [51.1531913, 43.6524625],
    [51.1530403, 43.6524488],
    [51.1529449, 43.6524112],
    [51.1528311, 43.6523246],
    [51.1527922, 43.6522557],
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

export interface NearbyTree {
  tree: Tree;
  distance: number;
}

/**
 * Радиус поиска возможных дублей. GPS телефона ошибается на 5–15 м, поэтому ищем
 * в пределах его точности; если точку поставили вручную на карте — в пределах 5 м.
 */
export function duplicateRadiusM(accuracy: number | null): number {
  if (accuracy === null) return 5;
  return Math.min(20, Math.max(5, accuracy));
}

/** Уже внесённые деревья в радиусе radiusM, ближайшие первыми — чтобы не внести дерево дважды. */
export function findNearbyTrees(
  trees: Tree[],
  lat: number,
  lon: number,
  radiusM: number,
  limit = 3
): NearbyTree[] {
  return trees
    .map((tree) => ({ tree, distance: distanceM(lat, lon, tree.latitude, tree.longitude) }))
    .filter((n) => n.distance <= radiusM)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, limit);
}
