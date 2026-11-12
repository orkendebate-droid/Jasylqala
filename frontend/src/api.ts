import type {
  CareTask,
  ConditionType,
  SpeciesInfo,
  SpeciesPrediction,
  TaskStatusType,
  TaskType,
  Tree,
  TreeFeatureCollection,
} from "./types";

const API_BASE = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

export function apiUrl(path: string): string {
  return path.startsWith("http") ? path : `${API_BASE}${path}`;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(apiUrl(path), init);
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.detail || "Ошибка запроса");
  }
  return resp.json();
}

const jsonInit = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export const fetchSpecies = () => request<SpeciesInfo[]>("/api/species");

export function fetchTrees(filters?: { species?: string; condition?: string }) {
  const params = new URLSearchParams();
  if (filters?.species) params.set("species", filters.species);
  if (filters?.condition) params.set("condition", filters.condition);
  const qs = params.toString();
  return request<TreeFeatureCollection>(`/api/trees${qs ? `?${qs}` : ""}`);
}

export const fetchTreeDetail = (treeId: number) =>
  request<Tree>(`/api/trees/${treeId}`);

export async function uploadPhoto(file: Blob, filename = "photo.jpg"): Promise<string> {
  const form = new FormData();
  form.append("file", file, filename);
  const data = await request<{ url: string }>("/api/uploads", { method: "POST", body: form });
  return data.url;
}

export const createTree = (payload: {
  client_id?: string;
  species: string;
  height_m: number;
  condition: ConditionType;
  latitude: number;
  longitude: number;
  photo_url?: string | null;
  notes?: string | null;
  is_demo?: boolean;
}) => request<Tree>("/api/trees", jsonInit("POST", payload));

export const createCareTask = (
  treeId: number,
  payload: { task_type: TaskType; notes?: string; photo_before_url?: string | null }
) => request<CareTask>(`/api/trees/${treeId}/tasks`, jsonInit("POST", payload));

export const updateCareTask = (
  taskId: number,
  payload: { status?: TaskStatusType; notes?: string; photo_after_url?: string | null }
) => request<CareTask>(`/api/tasks/${taskId}`, jsonInit("PATCH", payload));

export async function predictSpeciesRemote(file: Blob): Promise<SpeciesPrediction[]> {
  const form = new FormData();
  form.append("file", file, "tree.jpg");
  const data = await request<{ predictions: SpeciesPrediction[] }>("/api/predict-species", {
    method: "POST",
    body: form,
  });
  return data.predictions;
}
