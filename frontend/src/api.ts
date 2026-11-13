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

/**
 * Сервер недоступен: нет сети, таймаут, сервер спит/упал (5xx).
 * Отличается от обычной ошибки (4xx), где повторять запрос бессмысленно.
 * При NetworkError данные нужно класть в офлайн-очередь, а не терять.
 */
export class NetworkError extends Error {
  constructor(message = "Сервер недоступен") {
    super(message);
    this.name = "NetworkError";
  }
}

export const isNetworkError = (err: unknown): err is NetworkError => err instanceof NetworkError;

export const DEFAULT_TIMEOUT_MS = 15000;
export const UPLOAD_TIMEOUT_MS = 45000;

/** fetch с таймаутом; сетевые сбои, таймаут и 5xx превращаются в NetworkError. */
export async function fetchWithTimeout(
  input: string,
  init: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let resp: Response;
  try {
    resp = await fetch(input, { ...init, signal: controller.signal });
  } catch {
    throw new NetworkError(
      controller.signal.aborted ? "Сервер не ответил вовремя" : "Нет связи с сервером"
    );
  } finally {
    clearTimeout(timer);
  }
  if (resp.status >= 500) {
    throw new NetworkError(`Сервер временно недоступен (${resp.status})`);
  }
  return resp;
}

async function request<T>(path: string, init?: RequestInit, timeoutMs?: number): Promise<T> {
  const resp = await fetchWithTimeout(apiUrl(path), init, timeoutMs);
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(typeof err.detail === "string" ? err.detail : "Ошибка запроса");
  }
  return resp.json();
}

/** Быстрая проверка, что backend жив (Render free может спать). */
export async function pingServer(timeoutMs = 8000): Promise<boolean> {
  try {
    const resp = await fetchWithTimeout(apiUrl("/health"), {}, timeoutMs);
    return resp.ok;
  } catch {
    return false;
  }
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
  const data = await request<{ url: string }>(
    "/api/uploads",
    { method: "POST", body: form },
    UPLOAD_TIMEOUT_MS
  );
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

export interface TreeUpdatePayload {
  species?: string;
  height_m?: number;
  condition?: ConditionType;
  latitude?: number;
  longitude?: number;
  photo_url?: string | null;
  notes?: string | null;
}

export const updateTree = (treeId: number, payload: TreeUpdatePayload) =>
  request<Tree>(`/api/trees/${treeId}`, jsonInit("PATCH", payload));

export async function deleteTree(treeId: number): Promise<void> {
  const resp = await fetchWithTimeout(apiUrl(`/api/trees/${treeId}`), { method: "DELETE" });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(typeof err.detail === "string" ? err.detail : "Не удалось удалить дерево");
  }
}

export const createCareTask = (
  treeId: number,
  payload: { task_type: TaskType; notes?: string; photo_before_url?: string | null }
) => request<CareTask>(`/api/trees/${treeId}/tasks`, jsonInit("POST", payload));

export const updateCareTask = (
  taskId: number,
  payload: {
    status?: TaskStatusType;
    notes?: string;
    photo_after_url?: string | null;
    /** Результат ухода: обновляет паспорт дерева */
    tree_condition?: ConditionType;
    tree_height_m?: number;
  }
) => request<CareTask>(`/api/tasks/${taskId}`, jsonInit("PATCH", payload));

export async function predictSpeciesRemote(file: Blob): Promise<SpeciesPrediction[]> {
  const form = new FormData();
  form.append("file", file, "tree.jpg");
  const data = await request<{ predictions: SpeciesPrediction[] }>(
    "/api/predict-species",
    { method: "POST", body: form },
    UPLOAD_TIMEOUT_MS
  );
  return data.predictions;
}
