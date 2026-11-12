import { useState } from "react";
import { CheckCircle2, CloudDownload, Database, HardDrive, Layers, RefreshCw, X } from "lucide-react";
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
          <div>
            <h2>Офлайн-режим</h2>
            <span className="muted" style={{ fontSize: 13 }}>
              Автономная работа в степных и прибрежных зонах
            </span>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Закрыть">
            <X size={20} />
          </button>
        </div>

        <p className="muted" style={{ marginTop: 0 }}>
          Офлайн-пакет сохраняет векторные тайлы карты Актау, веса нейросети и базу деревьев в память браузера (Cache Storage & IndexedDB).
        </p>

        {/* Offline Status Card */}
        <div className="offline-status-card">
          {status.ready ? (
            <div className="status-ok">
              <CheckCircle2 size={24} color="#059669" />
              <div>
                <strong style={{ color: "#065f46" }}>Офлайн-пакет готов к работе</strong>
                <div className="muted" style={{ fontSize: 12, marginTop: 4, display: "flex", gap: 12, flexWrap: "wrap" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                    <Layers size={13} /> {status.tilesCount} тайлов OSM
                  </span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                    <Database size={13} /> {status.treesCount} паспортов
                  </span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                    <HardDrive size={13} /> Нейросеть активна
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="status-empty">
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <CloudDownload size={20} color="var(--color-primary)" />
                <strong>Пакет ещё не загружен</strong>
              </div>
              <span className="muted" style={{ fontSize: 12 }}>
                Скачайте данные для работы без интернета на выезде в Актау
              </span>
            </div>
          )}
        </div>

        {/* Progress Bar */}
        {progress && (
          <div className="progress-wrap" data-testid="offline-progress">
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
              <span style={{ fontWeight: 600, color: "var(--color-primary)" }}>{progress.message}</span>
              <strong style={{ color: "#0f172a" }}>{progress.percent}%</strong>
            </div>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${progress.percent}%` }} />
            </div>
          </div>
        )}

        {error && <div className="alert-error">{error}</div>}

        {/* Download Action */}
        <button
          type="button"
          className="btn-primary btn-full"
          disabled={downloading || !isOnline}
          onClick={handleDownload}
        >
          <CloudDownload size={18} />
          {downloading ? "Загрузка пакета..." : status.ready ? "Обновить офлайн-пакет" : "Скачать офлайн"}
        </button>

        {/* Pending Sync Section */}
        {pendingCount > 0 && (
          <div className="sync-box">
            <div>
              <div style={{ fontWeight: 600, color: "#9a3412" }}>
                Ожидают отправки: {pendingCount} дер.
              </div>
              <div className="muted" style={{ fontSize: 11, color: "#c2410c" }}>
                Сохранены в памяти устройства
              </div>
            </div>
            <button
              type="button"
              className="btn-secondary"
              disabled={!isOnline || syncing}
              onClick={handleSync}
            >
              <RefreshCw size={14} className={syncing ? "spin-slow" : ""} />
              {syncing ? "Синхронизация..." : "Отправить"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
