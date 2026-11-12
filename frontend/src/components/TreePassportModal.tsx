import { useState } from "react";
import { Check, CheckCircle2, Copy, Droplets, Image as ImageIcon, MapPin, Scissors, Search, Trees, X } from "lucide-react";
import { apiUrl, createCareTask, updateCareTask, uploadPhoto } from "../api";
import { compressImage } from "../utils/image";
import type { CareTask, TaskType, Tree } from "../types";

interface TreePassportModalProps {
  tree: Tree;
  isOnline: boolean;
  onClose: () => void;
  onUpdated: (treeId: number) => void;
}

const CONDITION_LABELS: Record<string, string> = {
  good: "Хорошее",
  fair: "Среднее",
  poor: "Слабое",
};

const TASK_LABELS: Record<TaskType, string> = {
  watering: "Полив",
  pruning: "Обрезка",
  inspection: "Осмотр",
};

export function TreePassportModal({
  tree,
  isOnline,
  onClose,
  onUpdated,
}: TreePassportModalProps) {
  const [taskType, setTaskType] = useState<TaskType>("watering");
  const [taskNotes, setTaskNotes] = useState("");
  const [beforeFile, setBeforeFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedCoords, setCopiedCoords] = useState(false);

  const handleCopyCoords = () => {
    const text = `${tree.latitude.toFixed(6)}, ${tree.longitude.toFixed(6)}`;
    navigator.clipboard?.writeText(text);
    setCopiedCoords(true);
    setTimeout(() => setCopiedCoords(false), 2000);
  };

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isOnline) {
      setError("Добавление задач доступно при подключении к сети");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      let photoBeforeUrl: string | null = null;
      if (beforeFile) {
        const compressed = await compressImage(beforeFile);
        photoBeforeUrl = await uploadPhoto(compressed, beforeFile.name);
      }
      await createCareTask(tree.id, {
        task_type: taskType,
        notes: taskNotes.trim() || undefined,
        photo_before_url: photoBeforeUrl,
      });
      setTaskNotes("");
      setBeforeFile(null);
      onUpdated(tree.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка создания задачи");
    } finally {
      setBusy(false);
    }
  };

  const handleCompleteTask = async (task: CareTask, afterFile?: File | null) => {
    if (!isOnline) {
      setError("Закрытие задач доступно при подключении к сети");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      let photoAfterUrl: string | null = null;
      if (afterFile) {
        const compressed = await compressImage(afterFile);
        photoAfterUrl = await uploadPhoto(compressed, afterFile.name);
      }
      await updateCareTask(task.id, {
        status: "done",
        photo_after_url: photoAfterUrl,
      });
      onUpdated(tree.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка обновления задачи");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Паспорт дерева"
      onClick={onClose}
    >
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="badge-row" style={{ marginBottom: 6 }}>
              <span className={`badge badge-${tree.condition}`}>
                {CONDITION_LABELS[tree.condition] || tree.condition}
              </span>
              {tree.is_demo && <span className="badge badge-demo">Демо</span>}
              {tree.id < 0 && <span className="badge badge-offline">Ожидает отправки</span>}
              <span className="muted" style={{ fontSize: 11 }}>
                ID #{tree.id > 0 ? tree.id : "офлайн"}
              </span>
            </div>
            <h2>{tree.species}</h2>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Закрыть">
            <X size={20} />
          </button>
        </div>

        {/* Hero Photo or styled placeholder */}
        {tree.photo_url ? (
          <div className="passport-hero">
            <img
              src={tree.photo_url.startsWith("data:") ? tree.photo_url : apiUrl(tree.photo_url)}
              alt={tree.species}
              className="passport-photo"
            />
          </div>
        ) : (
          <div
            style={{
              padding: "24px 16px",
              background: "#f1f5f9",
              borderRadius: "var(--radius-md)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              color: "var(--color-text-muted)",
              marginBottom: 16,
              fontSize: 13,
            }}
          >
            <Trees size={20} color="var(--color-primary)" />
            <span>Фото дерева ещё не загружено</span>
          </div>
        )}

        {/* Metrics Grid */}
        <div className="passport-grid">
          <div className="passport-metric-card">
            <span className="label">Высота</span>
            <strong>{tree.height_m} м</strong>
          </div>
          <div className="passport-metric-card">
            <span className="label">Состояние</span>
            <strong style={{ color: tree.condition === "good" ? "#059669" : tree.condition === "fair" ? "#d97706" : "#dc2626" }}>
              {CONDITION_LABELS[tree.condition] || tree.condition}
            </strong>
          </div>
          <div className="passport-metric-card" style={{ gridColumn: "span 2" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span className="label">Координаты GPS</span>
              <button
                type="button"
                className="icon-btn"
                style={{ padding: 2 }}
                onClick={handleCopyCoords}
                title="Скопировать координаты"
              >
                {copiedCoords ? <Check size={14} color="#059669" /> : <Copy size={14} />}
              </button>
            </div>
            <strong style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 14 }}>
              <MapPin size={14} color="var(--color-primary)" />
              {tree.latitude.toFixed(5)}, {tree.longitude.toFixed(5)}
            </strong>
          </div>
        </div>

        {tree.notes && <p className="passport-notes">{tree.notes}</p>}

        {tree.id > 0 && (
          <>
            <hr className="divider" />
            <div className="tasks-header">
              <h3>Журнал ухода и задач</h3>
              <span className="muted" style={{ fontSize: 12 }}>
                {tree.tasks?.length || 0} записей
              </span>
            </div>

            {error && <div className="alert-error">{error}</div>}

            <div className="tasks-list">
              {(!tree.tasks || tree.tasks.length === 0) && (
                <div
                  style={{
                    padding: "16px",
                    textAlign: "center",
                    background: "#f8fafc",
                    borderRadius: "var(--radius-md)",
                    border: "1px dashed var(--color-border)",
                  }}
                >
                  <p className="muted" style={{ margin: 0 }}>
                    Нет активных задач ухода
                  </p>
                </div>
              )}
              {tree.tasks?.map((task) => (
                <div key={task.id} className="task-item">
                  <div className="task-top">
                    <span className="task-title">
                      {task.task_type === "watering" && <Droplets size={16} color="#0284c7" />}
                      {task.task_type === "pruning" && <Scissors size={16} color="#d97706" />}
                      {task.task_type === "inspection" && <Search size={16} color="#059669" />}
                      {TASK_LABELS[task.task_type] || task.task_type}
                    </span>
                    <span className={`badge badge-task-${task.status}`}>
                      {task.status === "done" ? "Выполнено" : "В работе"}
                    </span>
                  </div>

                  {task.notes && <p className="task-notes">{task.notes}</p>}

                  {(task.photo_before_url || task.photo_after_url) && (
                    <div className="task-photos">
                      {task.photo_before_url && (
                        <div className="task-photo-wrap">
                          <img
                            src={apiUrl(task.photo_before_url)}
                            alt="До"
                            className="task-thumb"
                          />
                          <span className="task-photo-label">До</span>
                        </div>
                      )}
                      {task.photo_after_url && (
                        <div className="task-photo-wrap">
                          <img
                            src={apiUrl(task.photo_after_url)}
                            alt="После"
                            className="task-thumb"
                          />
                          <span className="task-photo-label">После</span>
                        </div>
                      )}
                    </div>
                  )}

                  {task.status !== "done" && (
                    <div className="task-actions">
                      <label className="btn-secondary btn-sm" style={{ cursor: "pointer" }}>
                        <ImageIcon size={14} /> Фото «после»
                        <input
                          type="file"
                          accept="image/*"
                          hidden
                          disabled={busy}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handleCompleteTask(task, f);
                          }}
                        />
                      </label>
                      <button
                        type="button"
                        className="btn-primary btn-sm"
                        disabled={busy}
                        onClick={() => handleCompleteTask(task)}
                      >
                        <CheckCircle2 size={14} /> Отметить выполненным
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Add Task Form */}
            <form className="task-form" onSubmit={handleAddTask}>
              <h4>Поставить задачу ухода</h4>
              <div className="form-row">
                <select
                  value={taskType}
                  onChange={(e) => setTaskType(e.target.value as TaskType)}
                >
                  <option value="watering">💧 Полив</option>
                  <option value="pruning">✂️ Обрезка</option>
                  <option value="inspection">🔍 Осмотр</option>
                </select>
                <input
                  type="text"
                  placeholder="Комментарий (напр.: полив 20 л)"
                  value={taskNotes}
                  onChange={(e) => setTaskNotes(e.target.value)}
                />
              </div>
              <div className="form-row">
                <label className="file-label" style={{ fontSize: 13, color: "var(--color-text-muted)" }}>
                  Фото «до» (необязательно):
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setBeforeFile(e.target.files?.[0] || null)}
                    style={{ fontSize: 12, padding: 6 }}
                  />
                </label>
                <button type="submit" className="btn-primary" disabled={busy} style={{ alignSelf: "flex-end" }}>
                  {busy ? "Сохранение..." : "+ Добавить задачу"}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
