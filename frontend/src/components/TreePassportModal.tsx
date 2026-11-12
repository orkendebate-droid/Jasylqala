import { useState } from "react";
import { CheckCircle2, Droplets, Scissors, Search, X } from "lucide-react";
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
            <div className="badge-row">
              <span className={`badge badge-${tree.condition}`}>
                {CONDITION_LABELS[tree.condition] || tree.condition}
              </span>
              {tree.is_demo && <span className="badge badge-demo">Демо</span>}
              {tree.id < 0 && <span className="badge badge-offline">Ожидает отправки</span>}
            </div>
            <h2>{tree.species}</h2>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Закрыть">
            <X size={20} />
          </button>
        </div>

        {tree.photo_url && (
          <img
            src={tree.photo_url.startsWith("data:") ? tree.photo_url : apiUrl(tree.photo_url)}
            alt={tree.species}
            className="passport-photo"
          />
        )}

        <div className="passport-grid">
          <div>
            <span className="label">Высота</span>
            <strong>{tree.height_m} м</strong>
          </div>
          <div>
            <span className="label">Координаты</span>
            <strong>
              {tree.latitude.toFixed(5)}, {tree.longitude.toFixed(5)}
            </strong>
          </div>
        </div>

        {tree.notes && <p className="passport-notes">{tree.notes}</p>}

        {tree.id > 0 && (
          <>
            <hr className="divider" />
            <h3>Уход</h3>

            {error && <div className="alert-error">{error}</div>}

            <div className="tasks-list">
              {(!tree.tasks || tree.tasks.length === 0) && (
                <p className="muted">Нет задач</p>
              )}
              {tree.tasks?.map((task) => (
                <div key={task.id} className="task-item">
                  <div className="task-top">
                    <span className="task-title">
                      {task.task_type === "watering" && <Droplets size={15} />}
                      {task.task_type === "pruning" && <Scissors size={15} />}
                      {task.task_type === "inspection" && <Search size={15} />}
                      {TASK_LABELS[task.task_type] || task.task_type}
                    </span>
                    <span className={`badge badge-task-${task.status}`}>
                      {task.status === "done" ? "Выполнено" : "В работе"}
                    </span>
                  </div>
                  {task.notes && <p className="task-notes">{task.notes}</p>}
                  <div className="task-photos">
                    {task.photo_before_url && (
                      <a href={apiUrl(task.photo_before_url)} target="_blank" rel="noreferrer">
                        Фото до
                      </a>
                    )}
                    {task.photo_after_url && (
                      <a href={apiUrl(task.photo_after_url)} target="_blank" rel="noreferrer">
                        Фото после
                      </a>
                    )}
                  </div>
                  {task.status !== "done" && (
                    <div className="task-actions">
                      <label className="btn-secondary btn-sm">
                        Завершить с фото «после»
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
                        <CheckCircle2 size={14} /> Выполнено
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <form className="task-form" onSubmit={handleAddTask}>
              <h4>Поставить задачу</h4>
              <div className="form-row">
                <select
                  value={taskType}
                  onChange={(e) => setTaskType(e.target.value as TaskType)}
                >
                  <option value="watering">Полив</option>
                  <option value="pruning">Обрезка</option>
                  <option value="inspection">Осмотр</option>
                </select>
                <input
                  type="text"
                  placeholder="Комментарий (например: полив 20 л)"
                  value={taskNotes}
                  onChange={(e) => setTaskNotes(e.target.value)}
                />
              </div>
              <div className="form-row">
                <label className="file-label">
                  Фото «до» (необязательно):
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => setBeforeFile(e.target.files?.[0] || null)}
                  />
                </label>
                <button type="submit" className="btn-primary" disabled={busy}>
                  {busy ? "Сохранение..." : "Добавить задачу"}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
