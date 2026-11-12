import type { SpeciesPrediction } from "../types";

interface SpeciesWeightEntry {
  id: string;
  name_ru: string;
  latin_name: string;
  prototype: [number, number, number, number, number];
}

interface WeightsFile {
  model_version: string;
  species: SpeciesWeightEntry[];
}

let cachedWeights: WeightsFile | null = null;

async function loadWeights(): Promise<WeightsFile> {
  if (cachedWeights) return cachedWeights;

  try {
    const resp = await fetch("/models/species_weights.json");
    if (resp.ok) {
      cachedWeights = await resp.json();
      return cachedWeights!;
    }
  } catch {
    // Network failed or offline, try cache storage below
  }

  if (typeof caches !== "undefined") {
    const cachedResp =
      (await caches.match("/models/species_weights.json")) ||
      (await (await caches.open("jasylqala-ml-model")).match("/models/species_weights.json"));
    if (cachedResp) {
      cachedWeights = await cachedResp.json();
      return cachedWeights!;
    }
  }

  throw new Error("Не удалось загрузить веса нейросети (проверьте интернет или скачайте офлайн-пакет)");
}

export function predictFromFeatureVector(
  features: [number, number, number, number, number],
  speciesList: SpeciesWeightEntry[]
): SpeciesPrediction[] {
  const logits = speciesList.map((sp) => {
    const dist = Math.sqrt(
      sp.prototype.reduce((acc, val, i) => acc + (val - features[i]) ** 2, 0)
    );
    return -dist * 8.0;
  });

  const maxLogit = Math.max(...logits);
  const exps = logits.map((l) => Math.exp(l - maxLogit));
  const sumExp = exps.reduce((a, b) => a + b, 0);
  const probs = exps.map((e) => e / sumExp);

  return speciesList
    .map((sp, idx) => ({
      species_id: sp.id,
      species_name: sp.name_ru,
      latin_name: sp.latin_name,
      probability: Number(probs[idx].toFixed(4)),
    }))
    .sort((a, b) => b.probability - a.probability)
    .slice(0, 3);
}

export async function extractCanvasFeatures(
  blob: Blob
): Promise<[number, number, number, number, number]> {
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Ошибка чтения изображения"));
      el.src = url;
    });

    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D недоступен");

    ctx.drawImage(img, 0, 0, 64, 64);
    const { data } = ctx.getImageData(0, 0, 64, 64);
    const pixels = 64 * 64;

    let rSum = 0;
    let gSum = 0;
    let bSum = 0;
    const grays = new Float32Array(pixels);

    for (let i = 0; i < pixels; i++) {
      const r = data[i * 4] / 255;
      const g = data[i * 4 + 1] / 255;
      const b = data[i * 4 + 2] / 255;
      rSum += r;
      gSum += g;
      bSum += b;
      grays[i] = (r + g + b) / 3;
    }

    const rMean = rSum / pixels;
    const gMean = gSum / pixels;
    const bMean = bSum / pixels;
    const mean = (rMean + gMean + bMean) / 3;
    let sqDiff = 0;
    for (let i = 0; i < pixels; i++) {
      sqDiff += (grays[i] - mean) ** 2;
    }
    const stdVal = Math.sqrt(sqDiff / pixels);
    const greenness = gMean - 0.5 * (rMean + bMean);

    return [rMean, gMean, bMean, stdVal, greenness];
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function predictSpeciesOffline(blob: Blob): Promise<SpeciesPrediction[]> {
  const [weights, features] = await Promise.all([
    loadWeights(),
    extractCanvasFeatures(blob),
  ]);
  return predictFromFeatureVector(features, weights.species);
}
