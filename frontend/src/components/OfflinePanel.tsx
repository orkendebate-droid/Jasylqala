import { useState } from "react";
import { CheckCircle2, CloudDownload, RefreshCw, X } from "lucide-react";
import { downloadOfflineBundle, type BundleProgress } from "../offline/bundle";
import type { OfflineBundleStatus } from "../types";

interface OfflinePanelProps {
  status: OfflineBundleStatus;
  pendingCount: number;
  isOnline: boolean;
  onClose: () => void;
  onStatusChange: (status: OfflineBundleStatus) => void;
  onSyncNow: () => Promise<void>;
}

export function OfflinePanel({
  status,
  pendingCount,
  isOnline,
  onClose,
  onStatusChange,
  onSyncNow,
}: OfflinePanelProps) {
  const [downloading, setDownloading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [progress, setProgress] = useState<BundleProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleDownload = async () => {
    if (!isOnline) {
      setError("Для скачивания офлайн-пакета нужен интернет");
      return;
    }
    setDownloading(true);
    setError(null);
    try {
      const next = await downloadOfflineBundle((p) => setProgress(p));
      onStatusChange(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка скачивания");
    } finally {
      setDownloading(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setError(null);
    try {
      await onSyncNow();
    } catch {
      setError("Не удалось синхронизировать");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Офлайн-режим"
      onClick={onClose}
    >
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Офлайн-режим</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Закрыть">
            <X size={20} />
          </button>
        </div>

        <p className="muted">Карта Актау, нейросеть и база деревьев.</p>

        <div className="offline-status-card">
          {status.ready ? (
            <div className="status-ok">
              <CheckCircle2 size={20} />
              <div>
                <strong>Готово</strong>
                <div className="muted">
                  {status.treesCount} дер. · {status.tilesCount} тайлов
                </div>
              </div>
            </div>
          ) : (
            <div className="status-empty">
              <strong>Не скачано</strong>
            </div>
          )}
        </div>

        {progress && (
          <div className="progress-wrap" data-testid="offline-progress">
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${progress.percent}%` }} />
            </div>
            <span className="muted">{progress.percent}%</span>
          </div>
        )}

        {error && <div className="alert-error">{error}</div>}

        <button
          type="button"
          className="btn-primary btn-full"
          disabled={downloading || !isOnline}
          onClick={handleDownload}
        >
          <CloudDownload size={18} />
          {downloading ? "Скачиваем..." : status.ready ? "Обновить" : "Скачать офлайн"}
        </button>

        {pendingCount > 0 && (
          <div className="sync-box">
            <span>Ожидают: {pendingCount}</span>
            <button
              type="button"
              className="btn-secondary"
              disabled={!isOnline || syncing}
              onClick={handleSync}
            >
              <RefreshCw size={15} /> {syncing ? "..." : "Отправить"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
