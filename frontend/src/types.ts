export type ConditionType = "good" | "fair" | "poor";
export type TaskType = "watering" | "pruning" | "inspection";
export type TaskStatusType = "pending" | "in_progress" | "done";

export interface SpeciesInfo {
  id: string;
  name_ru: string;
  name_kk: string;
  latin_name: string;
  description: string;
}

export interface SpeciesPrediction {
  species_id: string;
  species_name: string;
  latin_name: string;
  probability: number;
}

export interface CareTask {
  id: number;
  tree_id: number;
  task_type: TaskType;
  status: TaskStatusType;
  notes: string | null;
  photo_before_url: string | null;
  photo_after_url: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface Tree {
  id: number;
  client_id: string | null;
  species: string;
  height_m: number;
  condition: ConditionType;
  latitude: number;
  longitude: number;
  photo_url: string | null;
  notes: string | null;
  is_demo: boolean;
  created_at: string;
  tasks?: CareTask[];
}

export interface TreeFeatureCollection {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    id: number;
    geometry: { type: "Point"; coordinates: [number, number] };
    properties: Tree;
  }>;
}

export interface OfflinePendingTree {
  client_id: string;
  species: string;
  height_m: number;
  condition: ConditionType;
  latitude: number;
  longitude: number;
  notes: string;
  photo_url?: string | null;
  photoBlob?: Blob;
  photoDataUrl?: string;
  created_at: string;
}

export type OfflinePart = "data" | "model" | "map";

export interface OfflineBundleStatus {
  /** true, когда скачана хотя бы одна часть */
  ready: boolean;
  /** Какие тяжёлые части уже на устройстве. Если поля нет (старые данные) — считаем, что скачано всё. */
  parts?: Record<OfflinePart, boolean>;
  downloadedAt: string | null;
  treesCount: number;
  tilesCount: number;
}
